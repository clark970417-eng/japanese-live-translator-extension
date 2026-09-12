/** Stage 2: streaming recognition continuity across authored conditions.
 * Real pipeline and engines. Capture and VAD are bypassed, so a stuck
 * "listening" state caused by VAD gating cannot be observed here; this measures
 * whether recognition itself produces a usable partial and what it emits.
 */
import { app, powerSaveBlocker } from 'electron'
import { readFileSync, appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { TranslationPipeline } from '../src/pipeline/TranslationPipeline'
import { MlxWhisperEngine } from '../src/engines/stt/MlxWhisperEngine'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'

const env = process.env
for (const key of ['COMPARE_PROFILE', 'CORPUS_MANIFEST', 'CORPUS_AUDIO_DIR', 'COMPARE_REPORT']) {
  if (!env[key]) throw new Error('Missing ' + key)
}
app.setPath('userData', env.COMPARE_PROFILE!)

const WINDOWS = [0.8, 1.6, 2.8, 4.5, 6.5, 8.5]
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))

interface Row { id: string, condition: string, expect: string, reference: string, seconds: number }

function audio(id: string): Float32Array {
  const wav = readFileSync(join(env.CORPUS_AUDIO_DIR!, id + '.wav'))
  let offset = 12
  while (offset + 8 <= wav.length) {
    const size = wav.readUInt32LE(offset + 4), kind = wav.toString('ascii', offset, offset + 4)
    if (kind === 'data') return Float32Array.from({ length: size / 2 }, (_, i) => wav.readInt16LE(offset + 8 + i * 2) / 32768)
    offset += 8 + size + (size % 2)
  }
  throw new Error('Missing WAV data for ' + id)
}

app.whenReady().then(async () => {
  const report = env.COMPARE_REPORT!
  const rows = JSON.parse(readFileSync(env.CORPUS_MANIFEST!, 'utf8')) as Row[]
  const emit = (row: unknown): void => { appendFileSync(report, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)) }
  writeFileSync(report, '')

  const hold = powerSaveBlocker.start('prevent-app-suspension')
  const pipeline = new TranslationPipeline()
  const stt = new MlxWhisperEngine({ language: 'ja' })
  const translator = new HunyuanMT15Translator()
  pipeline.registerSTT('mlx-whisper', () => stt)
  pipeline.registerTranslator('continuity-translator', () => translator)
  const config = { mode: 'cascade' as const, sttEngineId: 'mlx-whisper', translatorEngineId: 'continuity-translator' }

  let trialStart = 0
  let firstSource: number | null = null, firstJa: number | null = null, firstZh: number | null = null
  const emissions: Array<{ atMs: number, source: string, translated: string, interim: boolean }> = []
  pipeline.on('source-result', (text: string) => { if (text && firstSource === null) firstSource = performance.now() - trialStart })
  pipeline.on('interim-result', r => {
    if (r.sourceText && firstJa === null) firstJa = performance.now() - trialStart
    if (r.translatedText && firstZh === null) firstZh = performance.now() - trialStart
    emissions.push({ atMs: Math.round(performance.now() - trialStart), source: r.sourceText || '', translated: r.translatedText || '', interim: true })
  })
  pipeline.on('error', e => emit({ type: 'error', error: String(e) }))

  try {
    emit({
      type: 'configuration', stt: 'mlx-whisper', translator: 'hunyuan-mt-15', windows: WINDOWS,
      provenance: 'authored Kyoko synthesis transformed locally; not real livestream speech',
      conditions: rows.map(row => row.condition), capture: false, vad: false
    })
    await pipeline.switchEngine(config)
    pipeline.setLanguageConfig('ja', 'zh')
    pipeline.start()
    await translator.translate('準備ができました。', 'ja', 'zh')

    for (const row of rows) {
      const pcm = audio(row.id)
      emissions.length = 0
      firstSource = null; firstJa = null; firstZh = null
      trialStart = performance.now()

      for (const seconds of WINDOWS.filter(s => s < pcm.length / 16000)) {
        await sleep(seconds * 1000 - (performance.now() - trialStart))
        await pipeline.processStreaming(pcm.slice(0, Math.round(seconds * 16000)), 16000)
      }
      await sleep(pcm.length / 16 - (performance.now() - trialStart))
      const final = await pipeline.finalizeStreaming(pcm, 16000)
      const end = performance.now()
      if (final?.sourceText) {
        emissions.push({ atMs: Math.round(end - trialStart), source: final.sourceText, translated: final.translatedText || '', interim: false })
        if (firstJa === null) firstJa = end - trialStart
      }

      const sources = emissions.map(e => e.source).filter(Boolean)
      const distinct = new Set(sources)
      emit({
        type: 'trial', id: row.id, condition: row.condition, expect: row.expect,
        reference: row.reference, audioSeconds: row.seconds,
        firstSourceMs: firstSource, firstJaMs: firstJa, firstZhMs: firstZh,
        finalSource: final?.sourceText || '', finalTranslated: final?.translatedText || '',
        // A silence control must produce nothing; speech must produce something.
        producedText: sources.length > 0,
        stuckListening: row.expect === 'speech' && sources.length === 0,
        hallucinatedOnSilence: row.expect === 'silence' && sources.length > 0,
        emissionCount: emissions.length, distinctSources: distinct.size,
        repeatedEmissions: sources.length - distinct.size,
        emissions
      })
      // Reset streaming state between conditions so one clip cannot seed the next.
      await pipeline.finalizeStreaming(new Float32Array(1600), 16000)
      await sleep(300)
    }
    emit({ type: 'complete', trials: rows.length })
  } catch (error) {
    emit({ type: 'fatal', error: String(error) })
    process.exitCode = 1
  } finally {
    await pipeline.dispose()
    powerSaveBlocker.stop(hold)
    app.quit()
  }
})
