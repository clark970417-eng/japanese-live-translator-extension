import { join } from 'path'
import type { TranslatorEngine, Language, TranslateContext } from '../types'
import { getGGUFDir, downloadGGUF } from '../model-downloader'
import type { WorkerInitOptions } from '../../main/worker-pool'
import { workerPool, WorkerTerminatedError, type WorkerPool } from '../../main/worker-pool'
import { createLogger } from '../../main/logger'

export interface GGUFVariantConfig {
  filename: string
  url: string
  sha256?: string
}

/**
 * Abstract base class for LLM-based translator engines that run via
 * the shared node-llama-cpp UtilityProcess worker pool.
 *
 * Subclasses provide model-specific configuration via template methods;
 * the lifecycle (initialize → download → acquire worker → translate → dispose)
 * is handled entirely by this base class.
 */
export abstract class LlamaWorkerTranslator implements TranslatorEngine {
  abstract readonly id: string
  abstract readonly name: string
  readonly isOffline = true

  protected initialized = false
  private initPromise: Promise<void> | null = null
  protected onProgress?: (message: string) => void
  protected variant: string
  protected kvCacheQuant: boolean
  protected modelPath: string = ''
  private _log: ReturnType<typeof createLogger> | null = null
  /** Aborted by `interrupt`. An interrupted engine is finished: it starts no
   * load and sends no request, so nothing it queued can reload its model after
   * the worker was stopped for someone else. */
  private interruption = new AbortController()

  /** The worker this engine runs in. Production shares one; a prototype may
   * pass its own so its model never enters the shared worker's queue. */
  protected pool: WorkerPool

  constructor(options?: { onProgress?: (message: string) => void; variant?: string; kvCacheQuant?: boolean; pool?: WorkerPool }) {
    this.pool = options?.pool ?? workerPool
    this.onProgress = options?.onProgress
    this.variant = options?.variant ?? 'Q4_K_M'
    this.kvCacheQuant = options?.kvCacheQuant ?? true
  }

  private get log(): ReturnType<typeof createLogger> {
    if (!this._log) this._log = createLogger(this.id)
    return this._log
  }

  // ── Template methods (override in subclasses) ──────────────────────

  /** Return the GGUF variant config map for the current model */
  protected abstract getVariants(): Record<string, GGUFVariantConfig>

  /** Human-readable label shown in progress messages (e.g. "Hunyuan-MT 7B") */
  protected abstract getModelSizeLabel(): string

  /** Extra WorkerInitOptions fields (e.g. modelType, draftModelPath) */
  protected getExtraInitOptions(): Partial<WorkerInitOptions> {
    return {}
  }

  /**
   * Hook called after model download but before worker acquire.
   * Subclasses can use this to prepare additional resources (e.g. draft models).
   */
  protected async afterDownload(): Promise<void> {
    // no-op by default
  }

  /** Hook called after worker reports model loaded */
  protected getLoadedSuffix(): string {
    return ''
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this.doInitialize().catch(error => { this.initPromise = null; throw error })
    return this.initPromise
  }

  private async doInitialize(): Promise<void> {
    if (this.initialized) return

    // Download model if needed
    const variants = this.getVariants()
    const variantConfig = variants[this.variant] ?? variants['Q4_K_M']!
    this.modelPath = join(getGGUFDir(), variantConfig.filename)
    await downloadGGUF(variantConfig.filename, variantConfig.url, this.onProgress, variantConfig.sha256)

    await this.afterDownload()
    this.interruption.signal.throwIfAborted()

    const label = this.getModelSizeLabel()
    this.onProgress?.(`Starting ${label} worker...`)

    await this.pool.acquire({
      modelPath: this.modelPath,
      kvCacheQuant: this.kvCacheQuant,
      ...this.getExtraInitOptions()
    }, this.onProgress, this.interruption.signal)

    const suffix = this.getLoadedSuffix()
    this.onProgress?.(`${label} model loaded${suffix}`)
    this.initialized = true
  }

  private serialContext(context?: TranslateContext): Omit<TranslateContext, 'signal' | 'onPartial'> | undefined {
    if (!context) return undefined
    const {signal: _signal, onPartial: _onPartial, ...value} = context
    return value
  }

  protected get workerOptions(): WorkerInitOptions {
    return { modelPath: this.modelPath, kvCacheQuant: this.kvCacheQuant, ...this.getExtraInitOptions() }
  }

  async translate(text: string, from: Language, to: Language, context?: TranslateContext): Promise<string> {
    if (!text.trim()) return ''
    if (from === to) return text
    if (!this.initialized) {
      throw new Error(`[${this.id}-worker] Not initialized`)
    }

    const t0 = performance.now()
    const result = await this.pool.sendRequest(
      { type: 'translate', text, from, to, context: this.serialContext(context) },
      'translate', this.workerOptions, this.requestSignal(context?.signal), context?.onPartial
    )
    const ms = performance.now() - t0
    this.log.info(`translate ${from}→${to} inputLen=${text.length} outputLen=${result.length} time=${ms.toFixed(0)}ms`)
    return result
  }

  async translateIncremental(
    text: string,
    previousOutput: string,
    from: Language,
    to: Language,
    context?: TranslateContext
  ): Promise<string> {
    if (!text.trim()) return previousOutput || ''
    if (from === to) return text
    if (!this.initialized) {
      throw new Error(`[${this.id}-worker] Not initialized`)
    }

    return this.pool.sendRequest(
      { type: 'translate-incremental', text, previousOutput, from, to, context: this.serialContext(context) },
      'translate-incremental', this.workerOptions, this.requestSignal(context?.signal)
    )
  }

  /**
   * SSBD (Self-Speculative Biased Decoding) translation for re-translation (#607).
   * Uses the previous translation as a speculative draft, verifying tokens in batch.
   * Only re-generates from the divergence point, significantly speeding up
   * re-translations when the source text is only slightly changed.
   *
   * Falls back to regular translate if SSBD fails in the worker.
   *
   * @param text - New source text to translate
   * @param previousOutput - Previous translation to use as speculative draft
   * @param from - Source language
   * @param to - Target language
   * @param context - Translation context (glossary, previous segments)
   */
  async translateSSBD(
    text: string,
    previousOutput: string,
    from: Language,
    to: Language,
    context?: TranslateContext
  ): Promise<string> {
    if (!text.trim()) return previousOutput || ''
    if (from === to) return text
    if (!this.initialized) {
      throw new Error(`[${this.id}-worker] Not initialized`)
    }

    const t0 = performance.now()
    const result = await this.pool.sendRequest(
      { type: 'translate-ssbd', text, previousOutput, from, to, context: this.serialContext(context) },
      'translate-ssbd', this.workerOptions, this.requestSignal(context?.signal)
    )
    const ms = performance.now() - t0
    this.log.info(`ssbd ${from}→${to} inputLen=${text.length} outputLen=${result.length} time=${ms.toFixed(0)}ms`)
    return result
  }

  /**
   * SimulMT translation with persistent KV cache session (#550).
   * Uses a multi-turn conversational format where the system prompt
   * and prior context are cached in KV, reducing latency for
   * incremental translation during simultaneous interpreting.
   *
   * @param text - Current source text (may be partial clause)
   * @param previousOutput - Previous translation to extend
   * @param from - Source language
   * @param to - Target language
   * @param isRevision - True when full clause arrived, retranslate for accuracy
   * @param context - Translation context (glossary, previous segments)
   */
  async translateSimulMt(
    text: string,
    previousOutput: string,
    from: Language,
    to: Language,
    isRevision: boolean,
    context?: TranslateContext
  ): Promise<string> {
    if (!text.trim()) return previousOutput || ''
    if (from === to) return text
    if (!this.initialized) {
      throw new Error(`[${this.id}-worker] Not initialized`)
    }

    const t0 = performance.now()
    const result = await this.pool.sendRequest(
      { type: 'translate-simulmt', text, previousOutput, from, to, isRevision, context: this.serialContext(context) },
      'translate-simulmt', this.workerOptions, this.requestSignal(context?.signal)
    )
    const ms = performance.now() - t0
    const label = isRevision ? 'simulmt-rev' : 'simulmt-incr'
    this.log.info(`${label} ${from}→${to} inputLen=${text.length} outputLen=${result.length} time=${ms.toFixed(0)}ms`)
    return result
  }

  /** Reset the persistent SimulMT session (e.g. on speech segment boundary) */
  resetSimulMtSession(): void {
    if (this.initialized) {
      this.pool.sendFireAndForget({ type: 'simulmt-reset' }, this.modelPath)
    }
  }

  /** Stops the shared worker immediately. A load in progress rejects instead of
   * finishing, and the next request respawns the worker. `dispose` still
   * releases this engine's reference afterwards. */
  interrupt(reason: string): void {
    // Terminate first, so work in progress fails as terminated rather than as
    // a cancellation sent to a process that is about to be killed.
    this.pool.terminate(reason)
    if (!this.interruption.signal.aborted) this.interruption.abort(new WorkerTerminatedError(reason))
  }

  /** The caller's signal, also aborted when this engine is interrupted. */
  private requestSignal(signal?: AbortSignal): AbortSignal {
    this.interruption.signal.throwIfAborted()
    return signal ? AbortSignal.any([signal, this.interruption.signal]) : this.interruption.signal
  }

  async dispose(): Promise<void> {
    if (this.initialized) {
      await this.pool.release()
      this.initialized = false
    }
    this.initPromise = null
  }
}
