/** Private local adapter for the existing browser UI; uses the production pipeline. */
import { createServer, type Server, type Socket } from 'net'
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
import { translateWrittenDraft } from './draft-fidelity'
import { selectDraftTerminology } from './draft-glossary'
import { CompanionScheduler } from './companion-scheduler'
import { speechEvidenceFor } from '../engines/stt/transcript-guard'
import type { SpeechEvidence } from '../engines/types'

/** How long a new browser connection waits for the current one to close before
 * it is treated as a second client and refused. */
const OWNER_RELEASE_GRACE_MS = 2000

export async function startExtensionCompanion(ctx: AppContext, directory?: string): Promise<Server> {
  const dir = directory || join(homedir(), 'Library/Application Support/JapaneseLiveCaption')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  const path = join(dir, 'desktop.sock')
  if (existsSync(path)) unlinkSync(path)
  let owned = false
  /** The previous connection's teardown. A client reconnecting after the old
   * socket closed is accepted at once, but starts no work until the session it
   * replaces has stopped. Refusing it instead would spend the browser's only
   * recovery attempt while that teardown was still running. */
  let teardown: Promise<void> = Promise.resolve()
  /** Connections waiting for the current owner to close. */
  const waiting: Array<() => void> = []
  const server = createServer(socket => {
    if (!owned) { serve(socket); return }
    // The owner may be a connection whose close has not been processed yet, such
    // as a browser host that died and was restarted immediately. Adopt this
    // client if the owner releases within the grace period; otherwise it is a
    // genuine second client and is refused.
    const adopt = (): void => { clearTimeout(refuse); if (!socket.destroyed) serve(socket) }
    const refuse = setTimeout(() => {
      const index = waiting.indexOf(adopt)
      if (index >= 0) waiting.splice(index, 1)
      socket.end()
    }, OWNER_RELEASE_GRACE_MS)
    waiting.push(adopt)
  })
  function serve(socket: Socket): void {
    owned = true
    const previousTeardown = teardown
    let ownsSession = false
    socket.setEncoding('utf8')
    let buffer = '', pending = 0, closed = false
    const queue = new CompanionScheduler()
    let translator: HunyuanMT2Translator | HunyuanMT15Translator | undefined
    let translatorMode: string | undefined
    const send = (value: unknown): void => { if (!closed) socket.write(JSON.stringify(value) + '\n') }
    type LocalMode = 'offline-hymt2' | 'offline-hymt15'
    const modeOf = (value: unknown): LocalMode => value === 'offline-hymt2' ? 'offline-hymt2' : 'offline-hymt15'
    const translatorFor = async (mode: LocalMode): Promise<HunyuanMT2Translator | HunyuanMT15Translator> => {
      if (!translator || translatorMode !== mode) {
        await translator?.dispose()
        translator = mode === 'offline-hymt2' ? new HunyuanMT2Translator({ variant: '7B-Q4_K_M' }) : new HunyuanMT15Translator()
        translatorMode = mode
      }
      return translator
    }
    const discardTranslator = async (): Promise<void> => {
      const stale = translator
      translator = undefined; translatorMode = undefined
      try { await stale?.dispose() } catch { /* its worker is already gone */ }
    }
    /** Terminology is chosen from the whole comment, so a clause retranslated
     * during repair keeps the meaning the full sentence established. */
    const draftWith = (engine: HunyuanMT2Translator | HunyuanMT15Translator, comment: string) => {
      const glossary = selectDraftTerminology(comment)
      return (text: string, signal?: AbortSignal): Promise<string> =>
        engine.translate(text, 'zh', 'ja', { signal, previousSegments: [], glossary })
    }
    /** Answer a draft request later, on the caption model, behind any audio work
     * already queued. Scheduled as its own task: awaiting it from inside the
     * current task would deadlock the serial scheduler. */
    const deferDraft = (id: number | undefined, text: string, mode: LocalMode): void => {
      pending++
      void queue.run(false, async fallbackPreempt => {
        try {
          if (closed) return
          const small = await translatorFor(mode)
          await small.initialize()
          const draft = await translateWrittenDraft(text, draftWith(small, text), fallbackPreempt)
          send({ id, ok: true, result: { ...draft, fallbackModel: true } })
        } catch (error) {
          send({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
        } finally { pending-- }
      }).catch(() => { socket.destroy() })
    }
    let current: { segment?: string; id?: number } = {}
    let lastAudio: Float32Array | null = null
    /** The speech evidence that arrived with `lastAudio`. Always assigned and
     * cleared together with it, so a finalized segment is judged only by what
     * the browser measured for that segment. */
    let lastEvidence: SpeechEvidence | undefined
    const revisions = new Map<number, string>()
    /** What the browser would show for each segment, without the timestamp. The
     * pipeline can emit one result twice within milliseconds; repeating it for
     * the same segment changes nothing on screen. The same words in another
     * segment are a new caption and are always sent. */
    const lastShown = new Map<string, string>()
    const captionFor = (segment: string | undefined, r: TranslationResult): void => {
      if (!segment) return
      // Recorded before the repeat check: a later correction may name this timestamp.
      revisions.set(r.timestamp, segment)
      if (revisions.size > 100) revisions.delete(revisions.keys().next().value!)
      const result = { text: r.sourceText, translated: r.translatedText, targetLanguage: r.targetLanguage, speakerLabel: r.speakerLabel, interim: !!r.isInterim, final: !r.isInterim }
      const shown = JSON.stringify(result)
      if (lastShown.get(segment) === shown) return
      lastShown.delete(segment)
      lastShown.set(segment, shown)
      if (lastShown.size > 100) lastShown.delete(lastShown.keys().next().value!)
      send({ event: 'caption', segment, result: { ...result, timestamp: r.timestamp } })
    }
    const caption = (r: TranslationResult): void => captionFor(current.segment, r)
    // Bound accepted translation work. Backpressure keeps audio in the browser queue.
    const finals = new Set<Promise<void>>()
    const drainFinals = async (): Promise<void> => { await Promise.all(finals) }
    const prepareFinal = async (audio: Float32Array, segment: string, evidence: SpeechEvidence | undefined): Promise<unknown> => {
      const pipeline = ctx.pipeline!
      if (finals.size >= 4) await Promise.race(finals)
      const prepared = await pipeline.prepareFinalStreaming(audio, 16000, evidence)
      if (!prepared) return { text: '', translated: '' }
      const sourceText = prepared.sourceText
      let completion: Promise<void>
      completion = prepared.completion.then(result => {
        if (result) captionFor(segment, result)
        else send({ event: 'caption', segment, result: { text: sourceText, translated: '', final: true, error: 'Translation did not complete' } })
      }).catch(error => {
        send({ event: 'caption', segment, result: { text: sourceText, translated: '', final: true, error: String(error) } })
      }).finally(() => { finals.delete(completion) })
      finals.add(completion)
      return { text: sourceText, translated: '', pending: true }
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
        let m: { id?: number; op?: string; audio?: string; text?: string; direction?: string; segment?: string; final?: boolean; speechSeconds?: unknown }
        try { m = JSON.parse(line) } catch { send({ ok: false, error: 'Invalid request' }); continue }
        if (!m || typeof m !== 'object') { send({ ok: false, error: 'Invalid request' }); continue }
        const audioPriority = ['decode', 'init', 'stop'].includes(m.op || '')
        // Reserve capacity for audio/control; excess page text must not disconnect capture.
        if (pending >= (audioPriority ? 16 : 12)) {
          send({ id: m.id, ok: false, error: 'Desktop queue is full; please retry' }); continue
        }
        pending++
        void queue.run(audioPriority, async preempt => {
          let deferred = false
          try {
            await previousTeardown
            if (closed) return
            const pipeline = ctx.pipeline
            if (!pipeline) throw new Error('Desktop pipeline not ready')
            let result: unknown
            if (m.op === 'settings') {
              ctx.mainWindow?.show(); ctx.mainWindow?.focus()
              result = { opened: true }
            } else if (m.op === 'stop') {
              if (ownsSession && lastAudio) { const result = await pipeline.finalizeStreaming(lastAudio, 16000, lastEvidence); if (result) caption(result) }
              lastAudio = null; lastEvidence = undefined
              if (ownsSession) { await drainFinals(); await pipeline.stop(); ctx.logger?.endSession(); ctx.logger = null }
              ownsSession = false; ctx.extensionConnected = false; current = {}; revisions.clear(); lastShown.clear()
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
              // Optional: an older browser sends none, and invalid values count as none.
              const evidence = speechEvidenceFor(m.speechSeconds, audio.length / 16000)
              if (lastAudio && current.segment && current.segment !== m.segment) {
                if (pipeline.canOverlapFinalTranslation && typeof pipeline.prepareFinalStreaming === 'function') await prepareFinal(lastAudio, current.segment, lastEvidence)
                else { const prior = await pipeline.finalizeStreaming(lastAudio, 16000, lastEvidence); if (prior) caption(prior) }
              }
              current = { id: m.id, segment: m.segment }
              lastAudio = m.final ? null : audio
              lastEvidence = m.final ? undefined : evidence
              let original = ''
              const source = (text: string): void => { original = text; send({ id: m.id, segment: m.segment, event: 'source', text }) }
              pipeline.on('source-result', source)
              try {
                if (m.final && m.segment && pipeline.canOverlapFinalTranslation && typeof pipeline.prepareFinalStreaming === 'function') {
                  result = await prepareFinal(audio, m.segment, evidence)
                } else {
                const translated = m.segment ? (m.final ? await pipeline.finalizeStreaming(audio, 16000, evidence) : await pipeline.processStreaming(audio, 16000, evidence)) : await pipeline.process(audio, 16000)
                if (translated && m.final && m.segment) revisions.set(translated.timestamp, m.segment)
                result = { text: translated?.sourceText || original, translated: translated?.translatedText || '', targetLanguage: translated?.targetLanguage }
                }
              } finally { pipeline.off('source-result', source) }
            } else if (m.op === 'translate') {
              if (typeof m.text !== 'string' || !m.text.trim() || m.text.length > 3000) throw new Error('Invalid text')
              if (!['ja-zh', 'zh-ja', 'ja-en'].includes(m.direction || 'ja-zh')) throw new Error('Invalid language')
              const from = m.direction === 'zh-ja' ? 'zh' : 'ja'
              const to = m.direction === 'zh-ja' ? 'ja' : m.direction === 'ja-en' ? 'en' : 'zh'
              // Drafts may use a more accurate model than the captions, but only
              // while no caption session is running. The shared worker unloads
              // one model to load another, and measuring that swap against live
              // audio put caption round trips above 20 s.
              const isDraft = from === 'zh' && to === 'ja'
              const captionMode = modeOf(store.get('translationEngine'))
              const requestedMode = isDraft && !pipeline.running ? modeOf(store.get('draftTranslationEngine')) : captionMode
              // A draft on a model the captions do not use will occupy the shared
              // worker with a load that captions would otherwise have to wait for.
              const displacesCaptions = isDraft && requestedMode !== captionMode
              if (displacesCaptions && !preempt.aborted) {
                const large = await translatorFor(requestedMode)
                const interrupt = (): void => { large.interrupt?.('Live captions started during a large-model draft') }
                preempt.addEventListener('abort', interrupt, { once: true })
                try {
                  // Captions may have arrived while the previous text model was
                  // being released, before this listener existed.
                  if (preempt.aborted) interrupt()
                  await large.initialize()
                  result = await translateWrittenDraft(m.text, draftWith(large, m.text), preempt)
                } catch (error) {
                  if (!preempt.aborted) throw error
                  // The large model produced nothing before captions needed the
                  // hardware. Finish this draft on the caption model after them.
                  deferDraft(m.id, m.text, captionMode)
                  deferred = true
                } finally {
                  preempt.removeEventListener('abort', interrupt)
                  // An interrupted engine points at a worker that no longer exists.
                  if (preempt.aborted) await discardTranslator()
                }
              } else {
                const active = await translatorFor(isDraft ? (displacesCaptions ? captionMode : requestedMode) : requestedMode)
                await active.initialize()
                result = isDraft
                  ? await translateWrittenDraft(m.text, draftWith(active, m.text), preempt)
                  : { text: await active.translate(m.text, from, to) }
              }
            } else throw new Error('Unsupported operation')
            if (!deferred) send({ id: m.id, ok: true, result })
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
      // Nobody is waiting for the active page-text work, and a reconnecting
      // client's captions wait for this queue to drain.
      queue.preemptActive(new Error('Browser disconnected'))
      ctx.pipeline?.off('draft-stt-result', caption)
      ctx.pipeline?.off('interim-result', caption); ctx.pipeline?.off('ger-corrected', correction)
      // The socket is gone, so another client may connect now; its work waits for this.
      owned = false
      teardown = queue.idle().then(async () => { try { if (ownsSession) { await ctx.pipeline?.stop(); ctx.logger?.endSession(); ctx.logger = null }; await drainFinals(); await translator?.dispose() } finally { ctx.extensionConnected = false } }).catch(() => {})
      waiting.shift()?.()
    })
  }
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(path, () => { chmodSync(path, 0o600); resolve() }) })
  return server
}
