/**
 * Shared UtilityProcess pool for slm-worker.
 *
 * Ensures only ONE slm-worker UtilityProcess runs at a time.
 * Multiple engines (SLMTranslator, HunyuanMTTranslator, HunyuanMT15Translator)
 * and the generate-summary handler all share this single worker.
 *
 * When a different model is needed, the pool sends a dispose+init sequence
 * to hot-swap the loaded model without killing the process.
 */

import { utilityProcess } from 'electron'
import { join } from 'path'
import {
  WORKER_INIT_TIMEOUT_MS,
  WORKER_DISPOSE_GRACE_MS,
  WORKER_MAX_PENDING_REQUESTS,
  WORKER_TRANSLATE_TIMEOUT_MS,
  WORKER_SUMMARIZE_TIMEOUT_MS
} from '../engines/constants'
import { createLogger } from './logger'
import { SerialTaskQueue } from './serial-task-queue'

const log = createLogger('worker-pool')

/** Messages received from the slm-worker UtilityProcess */
export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'partial'; id: string; text: string }
  | { type: 'result'; id: string; text: string }
  | { type: 'error'; id?: string; message: string }
  | { type: 'disposed' }

export interface PendingRequest {
  onPartial?: (text: string) => void
  resolve: (text: string) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface WorkerInitOptions {
  modelPath: string
  kvCacheQuant?: boolean
  modelType?: string
  draftModelPath?: string
}

/** Timeout value by request type */
export type RequestType = 'translate' | 'translate-incremental' | 'translate-ssbd' | 'translate-simulmt' | 'summarize' | 'ger-correct'

const TIMEOUT_BY_TYPE: Record<RequestType, number> = {
  'translate': WORKER_TRANSLATE_TIMEOUT_MS,
  'translate-incremental': WORKER_TRANSLATE_TIMEOUT_MS,
  'translate-ssbd': WORKER_TRANSLATE_TIMEOUT_MS,
  'translate-simulmt': WORKER_TRANSLATE_TIMEOUT_MS,
  'summarize': WORKER_SUMMARIZE_TIMEOUT_MS,
  'ger-correct': WORKER_TRANSLATE_TIMEOUT_MS
}

/**
 * Singleton pool managing a single slm-worker UtilityProcess.
 * Reference-counted: the process stays alive while any engine holds a reference.
 */
export class WorkerPool {
  private worker: Electron.UtilityProcess | null = null
  private pending = new Map<string, PendingRequest>()
  private nextId = 0
  private refCount = 0
  private currentModelPath: string | null = null
  private initPromise: Promise<void> | null = null
  private onProgress?: (message: string) => void
  /** Mutex to serialize initModel/disposeModel operations */
  private opLock: Promise<void> = Promise.resolve()
  private requestQueue = new SerialTaskQueue()
  private queuedRequests = 0
  private currentOptionsKey: string | null = null

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    return this.requestQueue.run(operation)
  }

  private async ensureModel(options: WorkerInitOptions): Promise<void> {
    const key = JSON.stringify([options.modelPath, options.modelType ?? '', options.kvCacheQuant ?? false, options.draftModelPath ?? ''])
    if (this.worker && this.currentOptionsKey === key) return
    this.currentOptionsKey = null
    if (this.worker) await this.hotSwapModel(options)
    else await this.spawnAndInit(options)
    this.currentOptionsKey = key
  }

  /**
   * Acquire a reference to the shared worker, initializing it with the given model.
   * If the worker is already running with a different model, it will hot-swap.
   */
  async acquire(options: WorkerInitOptions, onProgress?: (message: string) => void): Promise<void> {
    return this.exclusive(async () => {
      this.onProgress = onProgress
      try {
        await this.ensureModel(options)
        this.refCount++
      } catch (error) {
        this.currentOptionsKey = null
        if (this.refCount === 0) await this.killWorker()
        throw error
      }
    })
  }

  /**
   * Release a reference. When refCount reaches 0, the worker is killed.
   */
  async release(): Promise<void> {
    return this.exclusive(async () => {
      this.refCount = Math.max(0, this.refCount - 1)
      if (this.refCount === 0) await this.killWorker()
    })
  }

  /**
   * Send a message to the worker and return a promise for the result.
   */
  sendRequest(message: Record<string, unknown>, type: RequestType, options?: WorkerInitOptions, signal?: AbortSignal, onPartial?: (text: string) => void): Promise<string> {
    if (this.queuedRequests >= WORKER_MAX_PENDING_REQUESTS) {
      return Promise.reject(new Error('Translation queue is full; please retry'))
    }
    this.queuedRequests++
    return this.requestQueue.run(async () => {
      if (signal?.aborted) throw new Error('Translation cancelled')
      if (this.refCount === 0) throw new Error('Translation engine was released')
      if (options) await this.ensureModel(options)
      if (signal?.aborted) throw new Error('Translation cancelled')
      return this.dispatchRequest(message, type, signal, onPartial)
    }, signal).finally(() => { this.queuedRequests-- })
  }

  private dispatchRequest(message: Record<string, unknown>, type: RequestType, signal?: AbortSignal, onPartial?: (text: string) => void): Promise<string> {
    if (!this.worker) {
      return Promise.reject(new Error('[worker-pool] Worker not initialized'))
    }

    const id = String(this.nextId++)
    const timeout = TIMEOUT_BY_TYPE[type]
    const sendTime = performance.now()

    const worker = this.worker
    let cancellation: Error | undefined
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined
    let cancel: () => void = () => {}
    return new Promise<string>((resolve, reject) => {
      const fail = (error: Error): void => {
        clearTimeout(timer)
        clearTimeout(recoveryTimer)
        this.pending.delete(id)
        reject(cancellation ?? error)
      }
      const stop = (error: Error): void => {
        if (cancellation) return
        cancellation = error
        clearTimeout(timer)
        // Keep ownership until the worker acknowledges cancellation. If native
        // inference is stuck, retire that process before admitting the next job.
        recoveryTimer = setTimeout(() => {
          this.retireWorker(worker)
          fail(error)
        }, WORKER_DISPOSE_GRACE_MS)
        try { worker.postMessage({ type: 'cancel', id }) }
        catch { this.retireWorker(worker); fail(error) }
      }
      cancel = () => stop(new Error('Translation cancelled'))
      const timer = setTimeout(() => stop(new Error(`Worker request timed out (${type})`)), timeout)
      this.pending.set(id, {
        onPartial: text => { if (!cancellation && !signal?.aborted) onPartial?.(text) },
        resolve: (value: string) => {
          clearTimeout(timer)
          clearTimeout(recoveryTimer)
          if (cancellation) { reject(cancellation); return }
          const roundTripMs = performance.now() - sendTime
          if (roundTripMs > 2000) log.info(`Request ${id} round-trip: ${roundTripMs.toFixed(0)}ms (${type})`)
          resolve(value)
        },
        reject: fail,
        timer
      })
      signal?.addEventListener('abort', cancel, { once: true })
      try {
        worker.postMessage({ ...message, id, ...(onPartial && { streamOutput: true }) })
        if (signal?.aborted) cancel()
      } catch (error) {
        this.retireWorker(worker)
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    }).finally(() => signal?.removeEventListener('abort', cancel))
  }

  /** References survive a failed process so each queued caller can restore its model. */
  private retireWorker(worker: Electron.UtilityProcess): void {
    worker.removeAllListeners()
    // UtilityProcess.kill uses SIGTERM on POSIX; a frozen native process cannot
    // handle it. The cooperative grace already expired, so kill only this owned
    // child forcibly and let Chromium reap it.
    const pid = worker.pid
    if (pid) {
      try { process.kill(pid, 'SIGKILL') } catch { /* Already exited. */ }
    }
    try { worker.kill() } catch { /* Already exited. */ }
    if (this.worker === worker) {
      this.worker = null
      this.currentOptionsKey = null
      this.currentModelPath = null
      this.initPromise = null
    }
  }

  /**
   * Send a fire-and-forget message to the worker (no response expected).
   * Used for commands like 'simulmt-reset' that don't return a result.
   */
  sendFireAndForget(message: Record<string, unknown>, modelPath?: string): void {
    void this.exclusive(async () => {
      if (!modelPath || this.currentModelPath === modelPath) this.worker?.postMessage(message)
    }).catch(error => log.error('Worker command failed', error))
  }

  /** Check if the worker is alive and initialized */
  get isAlive(): boolean {
    return this.worker !== null
  }

  /** The model currently loaded in the worker */
  get loadedModelPath(): string | null {
    return this.currentModelPath
  }

  /** Current number of active references */
  get references(): number {
    return this.refCount
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async spawnAndInit(options: WorkerInitOptions): Promise<void> {
    const workerPath = join(__dirname, 'slm-worker.js')
    this.worker = utilityProcess.fork(workerPath)

    this.worker.on('exit', (code) => {
      log.info(`Worker exited with code ${code}`)
      this.worker = null
      this.currentOptionsKey = null
      this.currentModelPath = null
      this.initPromise = null
      // Reject all pending requests
      for (const [id, req] of this.pending) {
        clearTimeout(req.timer)
        req.reject(new Error('Worker process exited'))
        this.pending.delete(id)
      }
    })

    await this.initModel(options)
    this.registerMessageHandler()
  }

  private async hotSwapModel(options: WorkerInitOptions): Promise<void> {
    // Send dispose to unload current model (but keep process alive)
    await this.disposeModel()
    // Re-init with new model
    await this.initModel(options)
    // Re-register the persistent message handler (initModel clears all listeners)
    this.registerMessageHandler()
  }

  private initModel(options: WorkerInitOptions): Promise<void> {
    const op = this.opLock.then(
      () =>
        new Promise<void>((resolve, reject) => {
          let settled = false

          const cleanup = (): void => {
            this.worker?.removeListener('message', initHandler)
          }

          const timeout = setTimeout(() => {
            if (settled) return
            settled = true
            cleanup()
            reject(new Error('Worker initialization timed out'))
          }, WORKER_INIT_TIMEOUT_MS)

          const initHandler = (msg: WorkerMessage): void => {
            if (settled || !this.worker) return

            if (msg.type === 'ready') {
              settled = true
              clearTimeout(timeout)
              cleanup()
              this.currentModelPath = options.modelPath
              resolve()
            } else if (msg.type === 'error') {
              settled = true
              clearTimeout(timeout)
              cleanup()
              reject(new Error(msg.message))
            }
          }

          // Remove stale one-off listeners before attaching new handler
          this.worker?.removeAllListeners('message')
          this.worker!.on('message', initHandler)
          this.worker!.postMessage({
            type: 'init',
            modelPath: options.modelPath,
            kvCacheQuant: options.kvCacheQuant,
            modelType: options.modelType,
            ...(options.draftModelPath && { draftModelPath: options.draftModelPath })
          })
        })
    )
    // Chain the lock so subsequent ops wait, but don't propagate rejections to the chain
    this.opLock = op.catch(() => {})
    return op
  }

  private disposeModel(): Promise<void> {
    const op = this.opLock.then(
      () =>
        new Promise<void>((resolve) => {
          if (!this.worker) {
            resolve()
            return
          }

          let settled = false

          const cleanup = (): void => {
            this.worker?.removeListener('message', disposeHandler)
          }

          const timeout = setTimeout(() => {
            if (settled) return
            settled = true
            cleanup()
            resolve()
          }, WORKER_DISPOSE_GRACE_MS)

          const disposeHandler = (msg: WorkerMessage): void => {
            if (settled) return
            if (msg.type === 'disposed') {
              settled = true
              clearTimeout(timeout)
              cleanup()
              this.currentOptionsKey = null
      this.currentModelPath = null
              resolve()
            }
          }

          // Remove stale one-off listeners before attaching new handler
          this.worker.removeAllListeners('message')
          this.worker.on('message', disposeHandler)
          this.worker.postMessage({ type: 'dispose' })
        })
    )
    // Chain the lock so subsequent ops wait
    this.opLock = op.catch(() => {})
    return op
  }

  private registerMessageHandler(): void {
    if (!this.worker) return

    // Clear leftover listeners to prevent duplicates
    this.worker.removeAllListeners('message')
    this.worker.on('message', (msg: WorkerMessage) => {
      if (msg.type === 'partial' && msg.id) {
        this.pending.get(msg.id)?.onPartial?.(msg.text)
        return
      }
      if (msg.type === 'result' && msg.id) {
        const req = this.pending.get(msg.id)
        if (req) {
          clearTimeout(req.timer)
          this.pending.delete(msg.id)
          req.resolve(msg.text)
        }
        return
      }
      if (msg.type === 'error' && msg.id) {
        const req = this.pending.get(msg.id)
        if (req) {
          clearTimeout(req.timer)
          this.pending.delete(msg.id)
          req.reject(new Error(msg.message))
        }
        return
      }
      if (msg.type === 'error') {
        log.error('Worker error:', msg.message)
      }
    })
  }

  private async killWorker(): Promise<void> {
    if (!this.worker) return

    this.worker.removeAllListeners()

    try {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, WORKER_DISPOSE_GRACE_MS)
        this.worker!.once('message', (msg: WorkerMessage) => {
          if (msg.type === 'disposed') {
            clearTimeout(timeout)
            resolve()
          }
        })
        this.worker!.postMessage({ type: 'dispose' })
      })
    } catch {
      // Ignore errors during disposal
    }

    try {
      this.worker.kill()
    } catch {
      // Already exited
    }

    this.worker = null
    this.currentOptionsKey = null
    this.currentModelPath = null
    this.initPromise = null

    // Reject all pending requests
    for (const [, req] of this.pending) {
      clearTimeout(req.timer)
      req.reject(new Error('Worker pool disposed'))
    }
    this.pending.clear()
  }
}

/** Singleton shared worker pool */
export const workerPool = new WorkerPool()
