/** Stage 1: shared-worker contention between live audio and a written draft.
 * Real engines, real scheduler. Capture, VAD and rendering are bypassed, so
 * these are engine-and-scheduling numbers, not end-to-end UI latency.
 *
 * Modes alternate within one process so both share model state, thermal state
 * and machine load: `baseline` withholds the preemption signal from the draft
 * repair, `preempt` passes it. Same utterance for both halves of a pair.
 */
import { app, powerSaveBlocker } from 'electron'
import { readFileSync, appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { TranslationPipeline } from '../src/pipeline/TranslationPipeline'
import { MlxWhisperEngine } from '../src/engines/stt/MlxWhisperEngine'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'
import { CompanionScheduler } from '../src/main/companion-scheduler'
import { translateWrittenDraft } from '../src/main/draft-fidelity'

const env = process.env
for (const key of ['COMPARE_PROFILE', 'CORPUS_MANIFEST', 'CORPUS_AUDIO_DIR', 'COMPARE_REPORT']) {
  if (!env[key]) throw new Error('Missing ' + key)
}
app.setPath('userData', env.COMPARE_PROFILE!)

/** The written draft from the 3.8.5 handoff. It reaches the repair path when
 * the model drops the uncertainty marker, which is the reported failure. */
const DRAFT_SOURCE = '明天可能沒辦法來看，但我會看直播存檔，不要勉強自己喔'
const WINDOWS = [0.8, 1.6, 2.8, 4.5, 6.5, 8.5]
const PAIRS = Number(env.CONTENTION_PAIRS || 4)

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
const median = (values: number[]): number =>
  values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)] : 0

function audio(id: string): Float32Array {
  const wav = readFileSync(join(env.CORPUS_AUDIO_DIR!, id + '.wav'))
  let offset = 12
  while (offset + 8 <= wav.length) {
    const size = wav.readUInt32LE(offset + 4), kind = wav.toString('ascii', offset, offset + 4)
    if (kind === 'fmt ' && (wav.readUInt16LE(offset + 8) !== 1 || wav.readUInt16LE(offset + 10) !== 1
      || wav.readUInt32LE(offset + 12) !== 16000 || wav.readUInt16LE(offset + 22) !== 16)) {
      throw new Error('Expected mono PCM16 16kHz')
    }
    if (kind === 'data') {
      if (offset + 8 + size > wav.length) throw new Error('Truncated WAV')
      return Float32Array.from({ length: size / 2 }, (_, i) => wav.readInt16LE(offset + 8 + i * 2) / 32768)
    }
    offset += 8 + size + (size % 2)
  }
  throw new Error('Missing WAV data')
}

app.whenReady().then(async () => {
  const report = env.COMPARE_REPORT!
  const rows = JSON.parse(readFileSync(env.CORPUS_MANIFEST!, 'utf8')) as Array<{ id: string, reference: string }>
  const emit = (row: unknown): void => { appendFileSync(report, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)) }
  writeFileSync(report, '')

  const hold = powerSaveBlocker.start('prevent-app-suspension')
  const pipeline = new TranslationPipeline()
  const stt = new MlxWhisperEngine({ language: 'ja' })
  const captionTranslator = new HunyuanMT15Translator()
  // Production creates a separate translator for page text; both instances
  // share one worker process, which is where the contention happens.
  const draftTranslator = new HunyuanMT15Translator()
  pipeline.registerSTT('mlx-whisper', () => stt)
  pipeline.registerTranslator('corpus-translator', () => captionTranslator)
  const config = { mode: 'cascade' as const, sttEngineId: 'mlx-whisper', translatorEngineId: 'corpus-translator' }

  let firstJa: number | null = null, firstZh: number | null = null, trialStart = 0
  pipeline.on('interim-result', r => {
    if (r.sourceText && firstJa === null) firstJa = performance.now() - trialStart
    if (r.translatedText && firstZh === null) firstZh = performance.now() - trialStart
  })
  pipeline.on('error', e => emit({ type: 'error', error: String(e) }))

  try {
    emit({
      type: 'configuration', model: 'hunyuan-mt-15', stt: 'mlx-whisper-large-v3-turbo',
      manifestHash: createHash('sha256').update(readFileSync(env.CORPUS_MANIFEST!)).digest('hex'),
      capture: false, sourceLanguage: 'ja', windows: WINDOWS, pairs: PAIRS,
      draftSource: DRAFT_SOURCE, modes: ['baseline', 'preempt'],
      note: 'alternating modes in one process; draft repair deadline is 1800 ms in both modes'
    })

    await pipeline.switchEngine(config)
    pipeline.setLanguageConfig('ja', 'zh')
    pipeline.start()
    await draftTranslator.initialize()
    // Warm both directions so the first trial does not pay model load cost.
    await captionTranslator.translate('準備ができました。', 'ja', 'zh')
    await draftTranslator.translate('準備好了。', 'zh', 'ja')
    if (env.CORPUS_WARMUP) {
      const wav = readFileSync(env.CORPUS_WARMUP)
      let o = 12
      while (wav.toString('ascii', o, o + 4) !== 'data') o += 8 + wav.readUInt32LE(o + 4)
      const pcm = Float32Array.from({ length: wav.readUInt32LE(o + 4) / 2 }, (_, i) => wav.readInt16LE(o + 8 + i * 2) / 32768)
      await stt.processAudio(pcm, 16000)
    }

    for (let pair = 0; pair < PAIRS; pair++) {
      const row = rows[pair % rows.length]
      const pcm = audio(row.id)
      for (const mode of ['baseline', 'preempt'] as const) {
        const queue = new CompanionScheduler()
        const queueAges: number[] = []
        let draftCalls = 0
        firstJa = null; firstZh = null
        trialStart = performance.now()

        const translate = (text: string, signal?: AbortSignal): Promise<string> => {
          draftCalls++
          return draftTranslator.translate(text, 'zh', 'ja', { signal, previousSegments: [] })
        }
        let draft: Promise<Awaited<ReturnType<typeof translateWrittenDraft>>> | null = null
        const pending: Array<Promise<unknown>> = []

        for (const seconds of WINDOWS.filter(s => s < pcm.length / 16000)) {
          await sleep(seconds * 1000 - (performance.now() - trialStart))
          const slice = pcm.slice(0, Math.round(seconds * 16000))
          const enqueued = performance.now()
          pending.push(queue.run(true, async () => {
            queueAges.push(performance.now() - enqueued)
            const r = await pipeline.processStreaming(slice, 16000)
            if (r?.sourceText && firstJa === null) firstJa = performance.now() - trialStart
            if (r?.translatedText && firstZh === null) firstZh = performance.now() - trialStart
          }))
          // The reported failure is a typed comment arriving while captions run.
          if (!draft) {
            draft = queue.run(false, preempt =>
              translateWrittenDraft(DRAFT_SOURCE, translate, mode === 'preempt' ? preempt : undefined))
            pending.push(draft)
          }
        }

        await sleep(pcm.length / 16 - (performance.now() - trialStart))
        const audioEnd = performance.now()
        const enqueuedFinal = performance.now()
        const final = await queue.run(true, async () => {
          queueAges.push(performance.now() - enqueuedFinal)
          return pipeline.finalizeStreaming(pcm, 16000)
        })
        const end = performance.now()
        if (final?.sourceText && firstJa === null) firstJa = end - trialStart
        if (final?.translatedText && firstZh === null) firstZh = end - trialStart
        const draftResult = await draft
        await Promise.allSettled(pending)

        emit({
          type: 'trial', pair, mode, id: row.id,
          firstJaMs: firstJa, firstZhMs: firstZh,
          finalDelayMs: end - audioEnd,
          audioEndToChineseMs: firstZh !== null && firstZh > audioEnd - trialStart
            ? firstZh - (audioEnd - trialStart) : end - audioEnd,
          queueAgeMedianMs: median(queueAges), queueAgeMaxMs: Math.max(...queueAges),
          queueAges: queueAges.map(Math.round),
          draftCalls, draftRepaired: !!draftResult?.repaired,
          draftReviewWarning: !!draftResult?.reviewWarning,
          draftText: draftResult?.text,
          missingFinal: !final?.sourceText || !final?.translatedText,
          rssKB: app.getAppMetrics().reduce((total, p) => total + p.memory.workingSetSize, 0)
        })
        await sleep(500)
      }
    }
    emit({ type: 'complete', pairs: PAIRS })
  } catch (error) {
    emit({ type: 'fatal', error: String(error) })
    process.exitCode = 1
  } finally {
    await pipeline.dispose()
    await draftTranslator.dispose()
    powerSaveBlocker.stop(hold)
    app.quit()
  }
})
