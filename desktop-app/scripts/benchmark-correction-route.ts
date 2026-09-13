/** Prototype measurement for the two-model correction route. Not production.
 *
 * Phase A: small model only, the matched latency baseline.
 * Phase B: the same replay, with every final caption submitted to a
 *   CorrectionRouter whose large model lives in its own worker pool.
 * Phase C: the frozen holdout as final captions, to count corrections that land
 *   within the deadline and score the resulting caption text.
 *
 * Phase A always runs first, so the large model is never resident during the
 * baseline. The large model is loaded and warmed before phase B replays speech,
 * which is the route's most favorable case.
 */
import { app } from 'electron'
import { readFileSync, appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { TranslationPipeline } from '../src/pipeline/TranslationPipeline'
import { MlxWhisperEngine } from '../src/engines/stt/MlxWhisperEngine'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'
import { HunyuanMT2Translator } from '../src/engines/translator/HunyuanMT2Translator'
import { WorkerPool } from '../src/main/worker-pool'
import { CorrectionRouter, type CorrectionOutcome } from '../src/pipeline/correction-router'

const env = process.env
for (const key of ['COMPARE_PROFILE', 'CORPUS_MANIFEST', 'CORPUS_AUDIO_DIR', 'HOLDOUT_MANIFEST', 'HOLDOUT_IMMEDIATE', 'COMPARE_REPORT', 'GATES']) {
  if (!env[key]) throw new Error('Missing ' + key)
}
app.setPath('userData', env.COMPARE_PROFILE!)
const WINDOWS = [0.8, 1.6, 2.8, 4.5, 6.5, 8.5]
const gates = JSON.parse(readFileSync(env.GATES!, 'utf8'))
const DEADLINE = gates.deadlineMsAfterFinal as number
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, Math.max(0, ms)))
const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1)))] : 0
}
const swapouts = (): number => Number(execFileSync('vm_stat', { encoding: 'utf8' }).match(/Swapouts:\s+(\d+)/)![1])
const freePercent = (): number | null => {
  try { return Number(execFileSync('memory_pressure', { encoding: 'utf8' }).match(/free percentage: (\d+)%/)![1]) } catch { return null }
}

function audio(id: string): Float32Array {
  const wav = readFileSync(join(env.CORPUS_AUDIO_DIR!, id + '.wav'))
  let offset = 12
  while (offset + 8 <= wav.length) {
    const size = wav.readUInt32LE(offset + 4)
    if (wav.toString('ascii', offset, offset + 4) === 'data') return Float32Array.from({ length: size / 2 }, (_, i) => wav.readInt16LE(offset + 8 + i * 2) / 32768)
    offset += 8 + size + (size % 2)
  }
  throw new Error('Missing WAV data')
}

app.whenReady().then(async () => {
  const report = env.COMPARE_REPORT!
  const emit = (row: unknown): void => { appendFileSync(report, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)) }
  writeFileSync(report, '')
  const rows = JSON.parse(readFileSync(env.CORPUS_MANIFEST!, 'utf8')) as Array<{ id: string }>
  emit({ type: 'configuration', deadlineMs: DEADLINE, utterances: rows.length, prototype: true })

  const pipeline = new TranslationPipeline()
  const stt = new MlxWhisperEngine({ language: 'ja' })
  pipeline.registerSTT('mlx-whisper', () => stt)
  pipeline.registerTranslator('small', () => new HunyuanMT15Translator())
  await pipeline.switchEngine({ mode: 'cascade', sttEngineId: 'mlx-whisper', translatorEngineId: 'small' })
  pipeline.setLanguageConfig('ja', 'zh')
  pipeline.start()

  let firstZh: number | null = null, trialStart = 0
  pipeline.on('interim-result', r => { if (r.translatedText && firstZh === null) firstZh = performance.now() - trialStart })

  let minFree = 100
  const sampler = setInterval(() => { const f = freePercent(); if (f !== null) minFree = Math.min(minFree, f) }, 1000)

  async function replay(label: string, onFinal?: (segment: string, source: string, translated: string) => void) {
    const firsts: number[] = [], finals: number[] = []
    for (const [index, row] of rows.entries()) {
      const pcm = audio(row.id)
      firstZh = null; trialStart = performance.now()
      for (const seconds of WINDOWS.filter(s => s < pcm.length / 16000)) {
        await sleep(seconds * 1000 - (performance.now() - trialStart))
        const r = await pipeline.processStreaming(pcm.slice(0, Math.round(seconds * 16000)), 16000)
        if (r?.translatedText && firstZh === null) firstZh = performance.now() - trialStart
      }
      await sleep(pcm.length / 16 - (performance.now() - trialStart))
      const final = await pipeline.finalizeStreaming(pcm, 16000)
      const end = performance.now()
      if (final?.translatedText && firstZh === null) firstZh = end - trialStart
      firsts.push(firstZh ?? end - trialStart)
      finals.push(end - trialStart - pcm.length / 16)
      if (final?.sourceText && final.translatedText) onFinal?.(`${label}:${index}`, final.sourceText, final.translatedText)
      await sleep(250)
    }
    return {
      firstZhMedian: Math.round(percentile(firsts, .5)), firstZhP95: Math.round(percentile(firsts, .95)),
      finalDelayMedian: Math.round(percentile(finals, .5)), finalDelayP95: Math.round(percentile(finals, .95))
    }
  }

  try {
    // Phase A: baseline.
    await pipeline.processStreaming(audio(rows[0].id).slice(0, 16000), 16000)
    let swap = swapouts(); minFree = 100
    const baseline = await replay('baseline')
    emit({ type: 'phase-a-baseline', ...baseline, swapoutPages: swapouts() - swap, minFreePercent: minFree })

    // Phase B: route, large model in its own worker.
    const largePool = new WorkerPool()
    const large = new HunyuanMT2Translator({ variant: '7B-Q4_K_M', pool: largePool })
    await large.initialize()
    await large.translate('準備ができました。', 'ja', 'zh')
    const outcomes: Array<{ outcome: CorrectionOutcome, elapsedMs: number, differs: boolean }> = []
    const immediateBySegment = new Map<string, string>()
    let pendingCorrections = 0
    const router = new CorrectionRouter({
      deadlineMs: DEADLINE,
      correct: (source, signal) => large.translate(source, 'ja', 'zh', { signal, previousSegments: [] }),
      publish: () => {},
      onOutcome: (segment, outcome, elapsedMs) => {
        pendingCorrections--
        outcomes.push({ outcome, elapsedMs: Math.round(elapsedMs), differs: outcome !== 'unchanged' })
        emit({ type: 'correction', segment, outcome, elapsedMs: Math.round(elapsedMs) })
        immediateBySegment.delete(segment)
      }
    })
    swap = swapouts(); minFree = 100
    const route = await replay('route', (segment, source, translated) => {
      pendingCorrections++; immediateBySegment.set(segment, translated); router.submit(segment, source, translated)
    })
    while (pendingCorrections > 0) await sleep(100)
    emit({ type: 'phase-b-route', ...route, swapoutPages: swapouts() - swap, minFreePercent: minFree,
      outcomes: outcomes.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.outcome]: (acc[o.outcome] || 0) + 1 }), {}) })

    // Phase C: frozen holdout as final captions, one at a time like a slow talker.
    const holdout = JSON.parse(readFileSync(env.HOLDOUT_MANIFEST!, 'utf8')) as Array<{ id: string, ja: string, mustContain?: string[], mustNotContain?: string[] }>
    const immediate = new Map((readFileSync(env.HOLDOUT_IMMEDIATE!, 'utf8').trim().split('\n').map(l => JSON.parse(l))
      .filter((r: { type: string }) => r.type === 'trial') as Array<{ id: string, translated: string }>).map(r => [r.id, r.translated]))
    const check = (row: { mustContain?: string[], mustNotContain?: string[] }, text: string): boolean =>
      (row.mustContain || []).every(t => text.includes(t)) && !(row.mustNotContain || []).some(t => text.includes(t))
    let immediatePassed = 0, routedPassed = 0, landed = 0, differing = 0
    for (const row of holdout) {
      const first = immediate.get(row.id) || ''
      let shown = first
      await new Promise<void>(resolve => {
        const probe = new CorrectionRouter({
          deadlineMs: DEADLINE,
          correct: (source, signal) => large.translate(source, 'ja', 'zh', { signal, previousSegments: [] }),
          publish: (_segment, text) => { shown = text },
          onOutcome: (_segment, outcome, elapsedMs) => {
            if (outcome !== 'unchanged') differing++
            if (outcome === 'published') landed++
            emit({ type: 'holdout-correction', id: row.id, outcome, elapsedMs: Math.round(elapsedMs), immediate: first, shown })
            resolve()
          }
        })
        probe.submit(row.id, row.ja, first)
      })
      immediatePassed += check(row, first) ? 1 : 0
      routedPassed += check(row, shown) ? 1 : 0
    }
    emit({ type: 'phase-c-holdout', items: holdout.length, immediatePassed, routedPassed, differing, landed })

    clearInterval(sampler)
    await large.dispose()
    emit({ type: 'complete' })
  } catch (error) {
    emit({ type: 'fatal', error: String(error) })
    process.exitCode = 1
  } finally {
    clearInterval(sampler)
    await pipeline.dispose()
    app.quit()
  }
})
