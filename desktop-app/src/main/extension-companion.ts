/** Private local adapter for the existing browser UI; uses the production pipeline. */
import { createServer, type Server } from 'net'
import { mkdirSync, chmodSync, existsSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { TranslationResult } from '../engines/types'
import { store } from './store'
import { startPipeline, type PipelineStartConfig } from './ipc/pipeline-ipc'
import { buildEngineConfig, resolveEngineMode } from '../engine-selection'
import type { EngineMode, SttEngineType } from '../engine-selection'
import type { AppContext } from './app-context'
import { HunyuanMT2Translator } from '../engines/translator/HunyuanMT2Translator'
import { HunyuanMT15Translator } from '../engines/translator/HunyuanMT15Translator'
import { CompanionScheduler } from './companion-scheduler'

export async function startExtensionCompanion(ctx: AppContext, directory?: string): Promise<Server> {
  const dir = directory || join(homedir(), 'Library/Application Support/JapaneseLiveCaption')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  const path = join(dir, 'desktop.sock')
  if (existsSync(path)) unlinkSync(path)
  let owned = false
  const server = createServer(socket => {
    if (owned) { socket.end(); return }
    owned = true
    let ownsSession = false
    socket.setEncoding('utf8')
    let buffer = '', pending = 0, closed = false
    const queue = new CompanionScheduler()
    let translator: HunyuanMT2Translator | HunyuanMT15Translator | undefined
    let translatorMode: string | undefined
    const send = (value: unknown): void => { if (!closed) socket.write(JSON.stringify(value) + '\n') }
    let current: { segment?: string; id?: number } = {}
    let lastAudio: Float32Array | null = null
    const revisions = new Map<number, string>()
    const caption = (r: TranslationResult): void => {
      if (!current.segment) return
      revisions.set(r.timestamp, current.segment)
      if (revisions.size > 100) revisions.delete(revisions.keys().next().value!)
      send({ event: 'caption', segment: current.segment, result: { text: r.sourceText, translated: r.translatedText, targetLanguage: r.targetLanguage, speakerLabel: r.speakerLabel, interim: !!r.isInterim, final: !r.isInterim, timestamp: r.timestamp } })
    }
    const correction = (r: TranslationResult): void => {
      const segment = revisions.get(r.timestamp)
      if (segment) send({ event: 'caption', segment, result: { text: r.sourceText, translated: r.translatedText, correction: true, timestamp: r.timestamp } })
    }
    ctx.pipeline?.on('interim-result', caption)
    ctx.pipeline?.on('draft-stt-result', caption)
    ctx.pipeline?.on('ger-corrected', correction)
    socket.on('data', chunk => {
      buffer += chunk.toString()
      if (buffer.length > 2_000_000) { socket.destroy(); return }
      for (;;) {
        const newline = buffer.indexOf('\n'); if (newline < 0) break
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        let m: { id?: number; op?: string; audio?: string; text?: string; direction?: string; segment?: string; final?: boolean }
        try { m = JSON.parse(line) } catch { send({ ok: false, error: 'Invalid request' }); continue }
        if (!m || typeof m !== 'object') { send({ ok: false, error: 'Invalid request' }); continue }
        const audioPriority = ['decode', 'init', 'stop'].includes(m.op || '')
        // Reserve capacity for audio/control; excess page text must not disconnect capture.
        if (pending >= (audioPriority ? 16 : 12)) {
          send({ id: m.id, ok: false, error: 'Desktop queue is full; please retry' }); continue
        }
        pending++
        void queue.run(audioPriority, async () => {
          try {
            if (closed) return
            const pipeline = ctx.pipeline
            if (!pipeline) throw new Error('Desktop pipeline not ready')
            let result: unknown
            if (m.op === 'settings') {
              ctx.mainWindow?.show(); ctx.mainWindow?.focus()
              result = { opened: true }
            } else if (m.op === 'stop') {
              if (ownsSession && lastAudio) { const result = await pipeline.finalizeStreaming(lastAudio, 16000); if (result) caption(result); lastAudio = null }
              if (ownsSession) { await pipeline.stop(); ctx.logger?.endSession(); ctx.logger = null }
              ownsSession = false; ctx.extensionConnected = false; current = {}; revisions.clear()
              result = { stopped: true }
            } else if (m.op === 'init') {
              if (pipeline.active && !ownsSession) throw new Error('Stop desktop audio capture before starting browser capture.')
              ownsSession = true; ctx.extensionConnected = true
              ctx.subtitleWindow?.hide()
              if (!pipeline.active) {
                const keys = { apiKey: store.get('googleApiKey'), deeplApiKey: store.get('deeplApiKey'),
                  geminiApiKey: store.get('geminiApiKey'), microsoftApiKey: store.get('microsoftApiKey'),
                  microsoftRegion: store.get('microsoftRegion') }
                const mode = resolveEngineMode(store.get('translationEngine') as EngineMode, keys, null)
                const config = buildEngineConfig(mode, store.get('sttEngine') as SttEngineType, keys) as unknown as PipelineStartConfig
                const started = await startPipeline(ctx, config)
                if ('error' in started) throw new Error(started.error)
              }
              result = { model: `${pipeline.currentConfig?.sttEngineId} + ${pipeline.currentConfig?.translatorEngineId}`, dtype: 'native' }
            } else if (m.op === 'decode') {
              if (!ownsSession || !pipeline.running || typeof m.audio !== 'string') throw new Error('Start desktop mode first')
              const bytes = Buffer.from(m.audio, 'base64')
              if (!bytes.length || bytes.length % 4 || bytes.length > 1280000) throw new Error('Invalid audio size')
              const audio = new Float32Array(bytes.length / 4)
              for (let i = 0; i < audio.length; i++) audio[i] = bytes.readFloatLE(i * 4)
              if (!audio.every(Number.isFinite)) throw new Error('Invalid audio samples')
              if (lastAudio && current.segment && current.segment !== m.segment) {
                const prior = await pipeline.finalizeStreaming(lastAudio, 16000)
                if (prior) caption(prior)
              }
              current = { id: m.id, segment: m.segment }
              lastAudio = m.final ? null : audio
              let original = ''
              const source = (text: string): void => { original = text; send({ id: m.id, segment: m.segment, event: 'source', text }) }
              pipeline.on('source-result', source)
              try {
                const translated = m.segment ? (m.final ? await pipeline.finalizeStreaming(audio, 16000) : await pipeline.processStreaming(audio, 16000)) : await pipeline.process(audio, 16000)
                if (translated && m.final && m.segment) revisions.set(translated.timestamp, m.segment)
                result = { text: translated?.sourceText || original, translated: translated?.translatedText || '', targetLanguage: translated?.targetLanguage }
              } finally { pipeline.off('source-result', source) }
            } else if (m.op === 'translate') {
              if (typeof m.text !== 'string' || !m.text.trim() || m.text.length > 3000) throw new Error('Invalid text')
              if (!['ja-zh', 'zh-ja', 'ja-en'].includes(m.direction || 'ja-zh')) throw new Error('Invalid language')
              const from = m.direction === 'zh-ja' ? 'zh' : 'ja'
              const to = m.direction === 'zh-ja' ? 'ja' : m.direction === 'ja-en' ? 'en' : 'zh'
              const requestedMode = store.get('translationEngine') === 'offline-hymt2' ? 'offline-hymt2' : 'offline-hymt15'
              if (!translator || translatorMode !== requestedMode) {
                await translator?.dispose()
                translator = requestedMode === 'offline-hymt2'
                  ? new HunyuanMT2Translator({ variant: '7B-Q4_K_M' }) : new HunyuanMT15Translator()
                translatorMode = requestedMode
              }
              await translator.initialize()
              result = { text: await translator.translate(m.text, from, to) }
            } else throw new Error('Unsupported operation')
            send({ id: m.id, ok: true, result })
          } catch (error) {
            if (m.op === 'init' && ownsSession) { ownsSession = false; ctx.extensionConnected = false }
            send({ id: m.id, ok: false, error: error instanceof Error ? error.message : String(error) })
          }
          finally { pending-- }
        }).catch(() => { socket.destroy() })
      }
    })
    socket.on('error', () => socket.destroy())
    socket.on('close', () => {
      closed = true
      ctx.pipeline?.off('draft-stt-result', caption)
      ctx.pipeline?.off('interim-result', caption); ctx.pipeline?.off('ger-corrected', correction)
      void queue.idle().then(async () => { try { if (ownsSession) { await ctx.pipeline?.stop(); ctx.logger?.endSession(); ctx.logger = null }; await translator?.dispose() } finally { owned = false; ctx.extensionConnected = false } })
    })
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(path, () => { chmodSync(path, 0o600); resolve() }) })
  return server
}
