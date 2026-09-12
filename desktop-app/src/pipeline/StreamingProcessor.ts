import type { EventEmitter } from 'events'
import type {
  TranslationResult,
  Language,
  GlossaryEntry,
  TranslatorEngine,
  SpeakerDiarizer,
  DiarizationResult
} from '../engines/types'
import type { STTEngine } from '../engines/types'
import type { LocalAgreement } from './LocalAgreement'
import type { ContextBuffer } from './ContextBuffer'
import type { GERProcessor } from './GERProcessor'
import { detectClauseBoundary, detectTranslationBoundary, countUnits } from './ClauseBoundaryDetector'
import { createLogger } from '../main/logger'

const log = createLogger('pipeline:stream')

const MAX_STREAMING_LOCK_RESOLVERS = 50
const STREAMING_LOCK_TIMEOUT_MS = 10_000
/** Debounce delay before translating interim text (ms) */
const TRANSLATE_DEBOUNCE_MS = 250

export interface PreparedStreamingFinal {
  sourceText: string
  completion: Promise<TranslationResult | null>
}

export interface StreamingDeps {
  readonly emitter: EventEmitter
  readonly agreement: LocalAgreement
  readonly contextBuffer: ContextBuffer
  getSTTEngine(): STTEngine | null
  getTranslator(): TranslatorEngine | null
  getGlossary(): GlossaryEntry[]
  getCachedTranslation?(text: string, from: Language, to: Language): string | undefined
  canReuseInterimTranslation?(): boolean
  translateFinal?(text: string, from: Language, to: Language): Promise<string>
  getSimulMtConfig(): { enabled: boolean; waitK: number }
  resolveTargetLanguage(detectedLang: Language): Language
  /** Notify that processing count changed */
  incrementProcessing(): void
  decrementProcessing(): void
  /** GER processor for async STT post-correction */
  getGER?(): GERProcessor | null
  /** Draft STT engine for fast interim results (#536) */
  getDraftSTTEngine?(): STTEngine | null
  /** Speaker diarizer for multi-speaker identification (#549) */
  getDiarizer?(): SpeakerDiarizer | null
  /** Current pipeline session generation — used to drop stale async emits (#719) */
  getGeneration?(): number
}

/**
 * Handles streaming audio processing: processStreaming(), finalizeStreaming(),
 * and the streaming lock mechanism.
 * Extracted from TranslationPipeline to isolate streaming-specific logic.
 */
export class StreamingProcessor {
  private finalTail: Promise<unknown> = Promise.resolve()
  private finalGeneration = 0
  private lastFinalTimestamp = 0
  private pendingFinals = 0
  private streamingLock = false
  private streamingLockResolvers: Array<() => void> = []

  // Streaming translation state
  private lastTranslatedSource = ''
  lastTranslatedConfirmed = ''
  simulMtPreviousOutput = ''

  /** Debounced translation: timer and last source text for change detection */
  private translateDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private debouncedTranslationInFlight = false
  private pendingTranslation: (() => void) | null = null
  private interimAbort = new AbortController()
  private draftSttInFlight = false
  private recognitionRevision = 0
  private primaryRevision = 0
  private lastSourceTextForTranslate = ''

  /** SimulMT state: last boundary we translated up to (#550) */
  private simulMtLastBoundaryText = ''
  /** SimulMT: in-flight translation promise to prevent concurrent requests */
  private simulMtInFlight = false

  /** Last diarization result for merging with STT output (#549) */
  private lastDiarizationResult: DiarizationResult | null = null

  /** Clause-level overlap: source text already sent for translation (#615) */
  private clauseTranslatedPrefix = ''
  /** Clause-level overlap: translation result for the translated prefix (#615) */
  private clauseTranslation = ''
  /** Clause-level overlap: in-flight flag to prevent concurrent clause translations */
  private clauseTranslationInFlight = false

  private deps: StreamingDeps

  constructor(deps: StreamingDeps) {
    this.deps = deps
  }

  get isLocked(): boolean {
    return this.streamingLock
  }

  /**
   * Whether a result scheduled under generation `gen` may still be emitted (#719).
   * Returns true when generation tracking is unavailable (no getGeneration dep).
   */
  private samePrefix(prefix: string, text: string): boolean {
    const normalize = (s: string) => s.replace(/[\p{P}\s]/gu, '')
    return normalize(text).startsWith(normalize(prefix))
  }

  private utteranceGeneration = 0

  private isCurrentGeneration(gen: number | undefined, utterance: number): boolean {
    return utterance === this.utteranceGeneration && (gen === undefined || this.deps.getGeneration?.() === gen)
  }

  /** Reset all streaming state */
  reset(): void {
    this.finalGeneration++
    this.resetUtterance()
  }

  private resetUtterance(): void {
    this.interimAbort.abort()
    this.interimAbort = new AbortController()
    this.utteranceGeneration++
    this.streamingLock = false
    for (const r of this.streamingLockResolvers) r()
    this.streamingLockResolvers = []
    this.lastTranslatedSource = ''
    this.lastTranslatedConfirmed = ''
    this.simulMtPreviousOutput = ''
    if (this.translateDebounceTimer) {
      clearTimeout(this.translateDebounceTimer)
      this.translateDebounceTimer = null
    }
    this.lastSourceTextForTranslate = ''
    this.pendingTranslation = null
    this.simulMtLastBoundaryText = ''
    this.simulMtInFlight = false
    this.clauseTranslatedPrefix = ''
    this.clauseTranslation = ''
    this.clauseTranslationInFlight = false
    this.debouncedTranslationInFlight = false

    // Reset persistent SimulMT session in worker
    const translator = this.deps.getTranslator()
    if (translator?.resetSimulMtSession) {
      translator.resetSimulMtSession()
    }
  }

  /** Resume only the latest ready revision when the worker finishes. No polling. */
  private drainPendingTranslation(): void {
    if (this.pendingFinals || this.clauseTranslationInFlight || this.debouncedTranslationInFlight) return
    const pending = this.pendingTranslation
    this.pendingTranslation = null
    pending?.()
  }

  async processStreaming(
    audioBuffer: Float32Array,
    sampleRate: number
  ): Promise<TranslationResult | null> {
    const sttEngine = this.deps.getSTTEngine()
    if (!sttEngine) return null
    // Drop chunk if another streaming call is in-flight — acceptable because
    // the rolling buffer re-sends accumulated audio on the next interval (#103)
    if (this.streamingLock) return null

    this.deps.incrementProcessing()
    const revision = ++this.recognitionRevision
    this.streamingLock = true
    const gen = this.deps.getGeneration?.()
    const utterance = this.utteranceGeneration
    try {
      // Fire draft STT in parallel for fast interim results (#536)
      const draftSttEngine = this.deps.getDraftSTTEngine?.()
      if (draftSttEngine) {
        this.runDraftStt(draftSttEngine, audioBuffer, sampleRate, revision)
      }

      // Fire diarization in parallel with STT (#549)
      const diarizer = this.deps.getDiarizer?.()
      if (diarizer) {
        this.runDiarization(diarizer, audioBuffer, sampleRate)
      }

      const t0 = performance.now()
      const sttResult = await sttEngine.processAudio(audioBuffer, sampleRate)
      if (!this.isCurrentGeneration(gen, utterance)) return null
      const sttMs = (performance.now() - t0).toFixed(0)
      if (!sttResult || !sttResult.text.trim()) {
        log.info(`STT: ${sttMs}ms → (no result, ${(audioBuffer.length / sampleRate).toFixed(1)}s audio)`)
        // Reset agreement on silence to prevent stale state accumulation (#75)
        this.deps.agreement.reset()
        this.resetUtterance()
        return null
      }
      this.primaryRevision = revision
      log.info(`STT: ${sttMs}ms → "${sttResult.text}" [${sttResult.language}]`)

      const agreement = this.deps.agreement.update(sttResult.text)
      const targetLang = this.deps.resolveTargetLanguage(sttResult.language)

      const fullSourceText = agreement.confirmedText + agreement.interimText

      const simulMtConfig = this.deps.getSimulMtConfig()
      const translator = this.deps.getTranslator()
      const useSimulMt = simulMtConfig.enabled && translator?.translateSimulMt

      if (useSimulMt) {
        // SimulMT mode (#550): translate at clause boundaries using KV cache reuse
        this.handleSimulMtStreaming(
          fullSourceText,
          sttResult.language,
          targetLang,
          agreement.confirmedText,
          agreement.interimText,
          simulMtConfig.waitK
        )
      } else {
        // Fire clause-level overlap translation when new confirmed text is available (#615).
        // This runs in parallel (fire-and-forget) so translation starts before STT
        // finishes the next chunk, reducing perceived latency.
        if (agreement.newConfirmed) {
          this.runClauseTranslation(
            agreement.confirmedText,
            fullSourceText,
            sttResult.language,
            targetLang
          )
        }

        // Start the first hypothesis immediately; briefly coalesce subsequent revisions.
        // Busy requests retain only the latest pending source, so recognition continues
        // independently without building a translation backlog.
        if (fullSourceText !== this.lastSourceTextForTranslate) {
          this.lastSourceTextForTranslate = fullSourceText
          if (this.translateDebounceTimer) clearTimeout(this.translateDebounceTimer)
          this.pendingTranslation = null
          const translateWhenIdle = (): void => {
            this.translateDebounceTimer = null
            if (!this.isCurrentGeneration(gen, utterance)) return
            if (this.pendingFinals || this.clauseTranslationInFlight || this.debouncedTranslationInFlight) {
              this.pendingTranslation = translateWhenIdle
              return
            }
            if (fullSourceText === this.lastTranslatedSource) return
            const dbTranslator = this.deps.getTranslator()
            if (!dbTranslator || !fullSourceText.trim()) return
            const glossaryEntries = this.deps.getGlossary()
            const glossary = glossaryEntries.length > 0 ? glossaryEntries : undefined
            // Partial speech must not borrow words from earlier complete utterances.
            const ctx = { glossary, previousSegments: [], signal: this.interimAbort.signal,
              onPartial: (translatedText: string): void => {
                if (!this.isCurrentGeneration(gen, utterance) || fullSourceText !== this.lastSourceTextForTranslate) return
                this.deps.emitter.emit('interim-result', {
                  sourceText: this.lastSourceTextForTranslate, confirmedText: agreement.confirmedText,
                  interimText: agreement.interimText, translatedText, sourceLanguage: sttResult.language,
                  targetLanguage: targetLang, timestamp: Date.now(), isInterim: true
                })
              }
            }

            // Use SSBD for re-translation when we have a previous translation,
            // since most of the output likely remains valid (#607)
            this.debouncedTranslationInFlight = true
            const cached = this.deps.getCachedTranslation?.(fullSourceText, sttResult.language, targetLang)
            const translatePromise = cached !== undefined ? Promise.resolve(cached) : (dbTranslator.translateSSBD && this.lastTranslatedConfirmed)
              ? dbTranslator.translateSSBD(
                  fullSourceText,
                  this.lastTranslatedConfirmed,
                  sttResult.language,
                  targetLang,
                  ctx
                ).catch((ssbdErr) => {
                  if (ctx.signal.aborted || /Translation (timed out|exceeded its output limit|cancelled)/.test(String(ssbdErr))) throw ssbdErr
                  log.warn('SSBD debounced translation failed, falling back:', ssbdErr)
                  return dbTranslator.translate(fullSourceText, sttResult.language, targetLang, ctx)
                })
              : dbTranslator.translate(fullSourceText, sttResult.language, targetLang, ctx)

            translatePromise.then((translated) => {
              // Drop stale results before mutating shared state, so a switch mid-flight
              // cannot leave a resurfacing translatedText for the next generation (#719).
              if (!this.isCurrentGeneration(gen, utterance) || !this.samePrefix(fullSourceText, this.lastSourceTextForTranslate)) return
              this.lastTranslatedSource = fullSourceText
              this.lastTranslatedConfirmed = translated
              const debouncedResult: TranslationResult = {
                sourceText: this.lastSourceTextForTranslate,
                confirmedText: agreement.confirmedText,
                interimText: agreement.interimText,
                translatedText: translated,
                sourceLanguage: sttResult.language,
                targetLanguage: targetLang,
                timestamp: Date.now(),
                isInterim: true
              }
              this.deps.emitter.emit('interim-result', debouncedResult)
            }).catch((err) => {
              if (this.isCurrentGeneration(gen, utterance)) log.warn('Debounced translation failed:', err)
            }).finally(() => {
              if (this.isCurrentGeneration(gen, utterance)) {
                this.debouncedTranslationInFlight = false
                this.drainPendingTranslation()
              }
            })
          }
          this.translateDebounceTimer = setTimeout(translateWhenIdle, this.lastTranslatedSource ? TRANSLATE_DEBOUNCE_MS : 0)
        }
      }

      const interimResult: TranslationResult = {
        sourceText: fullSourceText,
        confirmedText: agreement.confirmedText,
        interimText: agreement.interimText,
        translatedText: this.samePrefix(this.lastTranslatedSource, fullSourceText) ? this.lastTranslatedConfirmed : '',
        sourceLanguage: sttResult.language,
        targetLanguage: targetLang,
        timestamp: Date.now(),
        isInterim: true,
        ...(this.lastDiarizationResult && {
          speakerLabel: this.lastDiarizationResult.speakerLabel,
          speakerIndex: this.lastDiarizationResult.speakerIndex
        })
      }

      this.deps.emitter.emit('interim-result', interimResult)
      return interimResult
    } catch (err) {
      this.deps.emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
      return null
    } finally {
      this.streamingLock = false
      this.deps.decrementProcessing()
      for (const r of this.streamingLockResolvers) r()
      this.streamingLockResolvers = []
    }
  }

  /** Recognize now, then translate accepted sentences in order without holding STT. */
  async prepareFinalStreaming(audioChunk: Float32Array, sampleRate: number): Promise<PreparedStreamingFinal | null> {
    // Persistent SimulMT sessions share mutable KV state; retain their serial boundary.
    if (this.deps.getSimulMtConfig().enabled && this.deps.getTranslator()?.translateSimulMt) {
      const result = await this.finalizeStreamingSerial(audioChunk, sampleRate)
      return result ? { sourceText: result.sourceText, completion: Promise.resolve(result) } : null
    }
    const stt = this.deps.getSTTEngine()
    if (!stt) return null
    if (this.streamingLock) {
      await this.waitForStreamingLock()
      if (this.streamingLock) return null
    }
    this.streamingLock = true
    this.deps.incrementProcessing()
    const gen = this.deps.getGeneration?.()
    const finalGeneration = this.finalGeneration
    this.interimAbort.abort()
    this.interimAbort = new AbortController()
    const utterance = ++this.utteranceGeneration
    this.pendingTranslation = null
    if (this.translateDebounceTimer) { clearTimeout(this.translateDebounceTimer); this.translateDebounceTimer = null }
    let handedOff = false
    try {
      const sttResult = await stt.processAudio(audioChunk, sampleRate)
      if (!this.isCurrentGeneration(gen, utterance) || finalGeneration !== this.finalGeneration) return null
      if (!sttResult?.text.trim()) {
        this.deps.agreement.reset()
        this.resetUtterance()
        return null
      }
      const sourceText = this.deps.agreement.finalize(sttResult.text).confirmedText
      const targetLanguage = this.deps.resolveTargetLanguage(sttResult.language)
      const translator = this.deps.getTranslator()
      const glossary = this.deps.getGlossary().map(entry => ({ ...entry }))
      const speaker = this.lastDiarizationResult
      const reused = this.deps.canReuseInterimTranslation?.() !== false && this.lastTranslatedSource === sourceText
        ? this.lastTranslatedConfirmed : ''
      const valid = (): boolean => finalGeneration === this.finalGeneration &&
        (gen === undefined || gen === this.deps.getGeneration?.())
      this.deps.emitter.emit('source-result', sourceText)
      this.resetUtterance()
      this.pendingFinals++
      handedOff = true
      const completion = this.finalTail.then(async (): Promise<TranslationResult | null> => {
        if (!valid()) return null
        try {
          const translatedText = reused || (translator ? this.deps.translateFinal
            ? await this.deps.translateFinal(sourceText, sttResult.language, targetLanguage)
            : await translator.translate(sourceText, sttResult.language, targetLanguage,
              this.deps.contextBuffer.getContext(glossary.length ? glossary : undefined)) : '')
          if (!valid()) return null
          this.deps.contextBuffer.add(sourceText, translatedText)
          const result: TranslationResult = {
            sourceText, translatedText, sourceLanguage: sttResult.language, targetLanguage,
            timestamp: this.lastFinalTimestamp = Math.max(Date.now(), this.lastFinalTimestamp + 1), isInterim: false, confidence: sttResult.confidence,
            ...(speaker && { speakerLabel: speaker.speakerLabel, speakerIndex: speaker.speakerIndex })
          }
          this.deps.emitter.emit('result', result)
          this.deps.getGER?.()?.maybeCorrect(sourceText, sttResult.confidence, sttResult.language,
            targetLanguage, result.timestamp, translatedText || undefined)
          return result
        } catch (error) {
          if (valid()) this.deps.emitter.emit('error', error instanceof Error ? error : new Error(String(error)))
          return null
        }
      }).finally(() => {
        this.pendingFinals--
        this.deps.decrementProcessing()
        this.drainPendingTranslation()
      })
      this.finalTail = completion.catch(() => null)
      return { sourceText, completion }
    } catch (error) {
      if (finalGeneration === this.finalGeneration) {
        this.deps.agreement.reset()
        this.resetUtterance()
        this.deps.emitter.emit('error', error instanceof Error ? error : new Error(String(error)))
      }
      return null
    } finally {
      this.streamingLock = false
      if (!handedOff) this.deps.decrementProcessing()
      for (const resolve of this.streamingLockResolvers) resolve()
      this.streamingLockResolvers = []
    }
  }

  async finalizeStreaming(audioChunk: Float32Array, sampleRate: number): Promise<TranslationResult | null> {
    const prepared = await this.prepareFinalStreaming(audioChunk, sampleRate)
    return prepared ? prepared.completion : null
  }

  private async finalizeStreamingSerial(
    audioChunk: Float32Array,
    sampleRate: number
  ): Promise<TranslationResult | null> {
    const sttEngine = this.deps.getSTTEngine()
    if (!sttEngine) return null

    if (this.streamingLock) {
      await this.waitForStreamingLock()
      // A timed-out waiter must not enter a non-reentrant STT engine.
      if (this.streamingLock) return null
    }
    this.deps.incrementProcessing()
    this.streamingLock = true
    const gen = this.deps.getGeneration?.()
    this.interimAbort.abort()
    this.interimAbort = new AbortController()
    const utterance = ++this.utteranceGeneration
    this.pendingTranslation = null
    if (this.translateDebounceTimer) { clearTimeout(this.translateDebounceTimer); this.translateDebounceTimer = null }

    try {
      const sttResult = await sttEngine.processAudio(audioChunk, sampleRate)
      if (!this.isCurrentGeneration(gen, utterance)) return null
      if (!sttResult || !sttResult.text.trim()) {
        this.deps.agreement.reset()
        this.resetUtterance()
        return null
      }

      const agreement = this.deps.agreement.finalize(sttResult.text)
      this.deps.emitter.emit('source-result', agreement.confirmedText)
      const targetLang = this.deps.resolveTargetLanguage(sttResult.language)

      const glossaryEntries = this.deps.getGlossary()
      const glossary = glossaryEntries.length > 0 ? glossaryEntries : undefined
      const translator = this.deps.getTranslator()

      const simulMtConfig = this.deps.getSimulMtConfig()
      const useSimulMt = simulMtConfig.enabled && translator?.translateSimulMt

      let translatedText = ''
      let translationStage: 'simulmt-revised' | undefined

      if (useSimulMt && translator && agreement.confirmedText.trim()) {
        // SimulMT revision: retranslate the full clause for accuracy (#550)
        translatedText = await translator.translateSimulMt!(
          agreement.confirmedText,
          this.simulMtPreviousOutput,
          sttResult.language,
          targetLang,
          true, // revision mode — full clause available
          this.deps.contextBuffer.getContext(glossary)
        )
        translationStage = 'simulmt-revised'
        if (!this.isCurrentGeneration(gen, utterance)) return null
        this.deps.contextBuffer.add(agreement.confirmedText, translatedText)

        // Reset SimulMT session for the next speech segment
        translator.resetSimulMtSession?.()
      } else if (translator && agreement.confirmedText.trim()) {
        translatedText = (this.deps.canReuseInterimTranslation?.() !== false && this.lastTranslatedSource === agreement.confirmedText && this.lastTranslatedConfirmed)
          ? this.lastTranslatedConfirmed
          : this.deps.translateFinal ? await this.deps.translateFinal(agreement.confirmedText, sttResult.language, targetLang) : await translator.translate(
          agreement.confirmedText,
          sttResult.language,
          targetLang,
          this.deps.contextBuffer.getContext(glossary)
        )
        if (!this.isCurrentGeneration(gen, utterance)) return null
        this.deps.contextBuffer.add(agreement.confirmedText, translatedText)
      }

      this.lastTranslatedSource = ''
      this.lastTranslatedConfirmed = ''
      this.simulMtPreviousOutput = ''
      this.simulMtLastBoundaryText = ''
      this.simulMtInFlight = false
      this.clauseTranslatedPrefix = ''
      this.clauseTranslation = ''
      this.clauseTranslationInFlight = false
      this.debouncedTranslationInFlight = false

      const result: TranslationResult = {
        sourceText: agreement.confirmedText,
        translatedText,
        sourceLanguage: sttResult.language,
        targetLanguage: targetLang,
        timestamp: Date.now(),
        isInterim: false,
        confidence: sttResult.confidence,
        ...(translationStage && { translationStage }),
        ...(this.lastDiarizationResult && {
          speakerLabel: this.lastDiarizationResult.speakerLabel,
          speakerIndex: this.lastDiarizationResult.speakerIndex
        })
      }

      this.deps.emitter.emit('result', result)

      // Fire-and-forget GER correction on finalized result (async, non-blocking)
      const ger = this.deps.getGER?.()
      if (ger) {
        ger.maybeCorrect(
          agreement.confirmedText,
          sttResult.confidence,
          sttResult.language,
          targetLang,
          result.timestamp,
          translatedText || undefined
        )
      }

      return result
    } catch (err) {
      this.deps.agreement.reset()
      this.lastTranslatedSource = ''
      this.lastTranslatedConfirmed = ''
      this.deps.emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
      return null
    } finally {
      this.streamingLock = false
      this.deps.decrementProcessing()
      for (const r of this.streamingLockResolvers) r()
      this.streamingLockResolvers = []
    }
  }

  /**
   * Handle SimulMT streaming translation (#550).
   *
   * Instead of debouncing for 1s, translates at clause/phrase boundaries
   * detected by the ClauseBoundaryDetector. Uses translateSimulMt() which
   * maintains a persistent KV cache session for lower latency.
   *
   * Translation triggers:
   * 1. New clause boundary detected (particle-based for JA, whitespace for EN)
   * 2. Enough units accumulated beyond waitK threshold
   * 3. Source text changed since last boundary translation
   */
  private handleSimulMtStreaming(
    fullSourceText: string,
    sourceLang: Language,
    targetLang: Language,
    confirmedText: string,
    interimText: string,
    waitK: number
  ): void {
    const translator = this.deps.getTranslator()
    if (!translator?.translateSimulMt || !fullSourceText.trim()) return

    // Skip if a SimulMT request is already in-flight
    if (this.simulMtInFlight) return

    // Check if we have enough units to start translating (wait-k policy)
    const unitCount = countUnits(fullSourceText, sourceLang)
    if (unitCount < waitK) return

    // Detect clause boundary in the source text
    const boundary = detectClauseBoundary(fullSourceText, sourceLang)
    const textToTranslate = boundary ? boundary.stablePrefix : fullSourceText

    // Skip if we already translated this exact boundary text
    if (textToTranslate === this.simulMtLastBoundaryText) return

    this.simulMtLastBoundaryText = textToTranslate
    this.simulMtInFlight = true

    const gen = this.deps.getGeneration?.()
    const utterance = this.utteranceGeneration
    const glossaryEntries = this.deps.getGlossary()
    const glossary = glossaryEntries.length > 0 ? glossaryEntries : undefined

    translator.translateSimulMt(
      textToTranslate,
      this.simulMtPreviousOutput,
      sourceLang,
      targetLang,
      false, // not a revision — incremental
      this.deps.contextBuffer.getContext(glossary)
    ).then((translated) => {
      if (!this.isCurrentGeneration(gen, utterance)) return

      this.simulMtPreviousOutput = translated
      this.lastTranslatedConfirmed = translated

      const simulMtResult: TranslationResult = {
        sourceText: fullSourceText,
        confirmedText,
        interimText,
        translatedText: translated,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        timestamp: Date.now(),
        isInterim: true,
        translationStage: 'simulmt-partial'
      }

      this.deps.emitter.emit('interim-result', simulMtResult)
    }).catch((err) => {
      log.warn('SimulMT translation failed:', err)
    }).finally(() => {
      this.simulMtInFlight = false
    })
  }

  /**
   * Run draft STT (Moonshine Tiny JA) in parallel with primary STT.
   * Emits result as 'draft-stt-result' immediately for fast interim display (#536).
   * Fire-and-forget — errors are logged but do not affect primary pipeline.
   */
  private runDraftStt(draftEngine: STTEngine, audioBuffer: Float32Array, sampleRate: number, revision: number): void {
    if (this.draftSttInFlight) return
    this.draftSttInFlight = true
    const t0 = performance.now()
    const gen = this.deps.getGeneration?.()
    const utterance = this.utteranceGeneration
    draftEngine.processAudio(audioBuffer, sampleRate)
      .then((draftResult) => {
        const draftMs = (performance.now() - t0).toFixed(0)
        if (!draftResult || !draftResult.text.trim()) {
          log.info(`Draft STT: ${draftMs}ms → (no result)`)
          return
        }
        log.info(`Draft STT: ${draftMs}ms → "${draftResult.text}" [${draftResult.language}]`)

        if (!this.isCurrentGeneration(gen, utterance) || revision <= this.primaryRevision) return

        const targetLang = this.deps.resolveTargetLanguage(draftResult.language)

        const draftTranslationResult: TranslationResult = {
          sourceText: draftResult.text,
          translatedText: '', // Draft STT only provides source text — no translation yet
          sourceLanguage: draftResult.language,
          targetLanguage: targetLang,
          timestamp: Date.now(),
          isInterim: true
        }

        this.deps.emitter.emit('draft-stt-result', draftTranslationResult)
      })
      .catch((err) => {
        log.warn('Draft STT error (non-fatal):', err instanceof Error ? err.message : err)
      }).finally(() => { this.draftSttInFlight = false })
  }

  /**
   * Run speaker diarization in parallel with primary STT (#549).
   * Fire-and-forget — errors are logged but do not affect primary pipeline.
   * Updates lastDiarizationResult for the next emit cycle.
   */
  private runDiarization(diarizer: SpeakerDiarizer, audioBuffer: Float32Array, sampleRate: number): void {
    const t0 = performance.now()
    diarizer.processAudio(audioBuffer, sampleRate)
      .then((result) => {
        const diarizeMs = (performance.now() - t0).toFixed(0)
        if (!result) {
          log.info(`Diarization: ${diarizeMs}ms → (no speaker)`)
          return
        }
        log.info(`Diarization: ${diarizeMs}ms → ${result.speakerLabel} (confidence: ${result.confidence.toFixed(2)})`)
        this.lastDiarizationResult = result
      })
      .catch((err) => {
        log.warn('Diarization error (non-fatal):', err instanceof Error ? err.message : err)
      })
  }

  /**
   * Run clause-level overlap translation when new confirmed text arrives (#615).
   *
   * Detects a clause boundary in the confirmed text and translates up to that
   * boundary immediately (fire-and-forget), without waiting for the debounce timer.
   * This overlaps translation with the next STT chunk, reducing end-to-end latency.
   *
   * Uses SSBD when a previous clause translation exists to avoid re-translating
   * the already-translated prefix.
   */
  private runClauseTranslation(
    confirmedText: string,
    fullSourceText: string,
    sourceLang: Language,
    targetLang: Language
  ): void {
    const translator = this.deps.getTranslator()
    if (!translator || !confirmedText.trim()) return

    // Skip if already translating a clause or nothing new to translate
    if (this.pendingFinals || this.clauseTranslationInFlight || this.debouncedTranslationInFlight) return
    if (confirmedText === this.clauseTranslatedPrefix) return

    // Detect clause boundary in confirmed text
    const boundary = detectTranslationBoundary(confirmedText, sourceLang)
    if (!boundary) return

    const textToTranslate = boundary.stablePrefix

    // Skip if this boundary was already translated
    if (textToTranslate === this.clauseTranslatedPrefix) return

    // Confirmation can trail a successful full-hypothesis translation. Do not
    // spend another decode replacing it with a shorter prefix. Only reuse it
    // while it still matches the current hypothesis; corrections must translate.
    if (this.lastTranslatedConfirmed &&
        this.samePrefix(textToTranslate, this.lastTranslatedSource) &&
        this.samePrefix(this.lastTranslatedSource, fullSourceText)) return

    this.clauseTranslationInFlight = true

    const gen = this.deps.getGeneration?.()
    const utterance = this.utteranceGeneration
    const glossaryEntries = this.deps.getGlossary()
    const glossary = glossaryEntries.length > 0 ? glossaryEntries : undefined
    // Keep glossary hints without leaking previous sentences into a partial draft.
    const ctx = { glossary, previousSegments: [], signal: this.interimAbort.signal }

    const t0 = performance.now()

    // Use SSBD if we have a previous clause translation to build on (#607)
    const translatePromise = (translator.translateSSBD && this.clauseTranslation)
      ? translator.translateSSBD(
          textToTranslate,
          this.clauseTranslation,
          sourceLang,
          targetLang,
          ctx
        ).catch((ssbdErr) => {
          if (ctx.signal.aborted || /Translation (timed out|exceeded its output limit|cancelled)/.test(String(ssbdErr))) throw ssbdErr
          log.warn('SSBD clause translation failed, falling back:', ssbdErr)
          return translator.translate(textToTranslate, sourceLang, targetLang, ctx)
        })
      : translator.translate(textToTranslate, sourceLang, targetLang, ctx)

    translatePromise.then((translated) => {
      const clauseMs = (performance.now() - t0).toFixed(0)
      log.info(`Clause translation: ${clauseMs}ms → "${translated}" (prefix: "${textToTranslate}")`)

      if (!this.isCurrentGeneration(gen, utterance) || !this.samePrefix(fullSourceText, this.lastSourceTextForTranslate)) return

      this.clauseTranslatedPrefix = textToTranslate
      this.clauseTranslation = translated
      this.lastTranslatedSource = textToTranslate
      this.lastTranslatedConfirmed = translated

      const clauseResult: TranslationResult = {
        sourceText: this.lastSourceTextForTranslate,
        translatedText: translated,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        timestamp: Date.now(),
        isInterim: true
      }
      this.deps.emitter.emit('interim-result', clauseResult)
    }).catch((err) => {
      log.warn('Clause translation error (non-fatal):', err instanceof Error ? err.message : err)
    }).finally(() => {
      if (this.isCurrentGeneration(gen, utterance)) {
        this.clauseTranslationInFlight = false
        this.drainPendingTranslation()
      }
    })
  }

  /**
   * Wait for the streaming lock to be released with a timeout and backpressure cap.
   * If more than MAX_STREAMING_LOCK_RESOLVERS are already waiting, the oldest
   * resolvers are auto-resolved to prevent unbounded growth (#292, #431).
   */
  private waitForStreamingLock(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Evict oldest waiters when the queue is full to prevent unbounded growth (#431)
      if (this.streamingLockResolvers.length >= MAX_STREAMING_LOCK_RESOLVERS) {
        const evictCount = this.streamingLockResolvers.length - MAX_STREAMING_LOCK_RESOLVERS + 1
        log.warn(
          `streamingLock resolver queue overflow: evicting ${evictCount} oldest resolver(s) (queue size: ${this.streamingLockResolvers.length})`
        )
        for (let i = 0; i < evictCount; i++) {
          const oldest = this.streamingLockResolvers.shift()
          if (oldest) oldest()
        }
      }

      // Auto-resolve after timeout so callers never hang indefinitely
      const timer = setTimeout(() => {
        const idx = this.streamingLockResolvers.indexOf(release)
        if (idx !== -1) {
          this.streamingLockResolvers.splice(idx, 1)
          log.warn('streamingLock wait timed out')
          resolve()
        }
      }, STREAMING_LOCK_TIMEOUT_MS)

      const release = (): void => {
        clearTimeout(timer)
        resolve()
      }
      this.streamingLockResolvers.push(release)
    })
  }

  /**
   * Count words in text. For CJK text (Japanese/Chinese/Korean), count characters
   * since there are no space-delimited word boundaries.
   */
  private countWords(text: string, language: Language): number {
    if (language === 'ja' || language === 'zh') {
      return text.replace(/\s/g, '').length
    }
    if (language === 'ko') {
      return text.replace(/\s/g, '').length
    }
    return text.trim().split(/\s+/).filter(Boolean).length
  }
}
