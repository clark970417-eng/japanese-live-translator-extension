/** One owner at a time, including recovery. Cancelled waiting work leaves immediately. */
export class SerialTaskQueue {
  private waiting: Array<() => Promise<void>> = []
  private active = false

  run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new Error('Translation cancelled'))
    return new Promise<T>((resolve, reject) => {
      const cancel = (): void => {
        const index = this.waiting.indexOf(task)
        if (index < 0) return // Active work owns its cancellation and cleanup.
        this.waiting.splice(index, 1)
        signal?.removeEventListener('abort', cancel)
        reject(new Error('Translation cancelled'))
      }
      const task = async (): Promise<void> => {
        signal?.removeEventListener('abort', cancel)
        try { resolve(await operation()) } catch (error) { reject(error) }
      }
      this.waiting.push(task)
      signal?.addEventListener('abort', cancel, { once: true })
      void this.pump()
    })
  }

  private async pump(): Promise<void> {
    if (this.active) return
    this.active = true
    try {
      while (this.waiting.length) await this.waiting.shift()!()
    } finally { this.active = false }
  }
}
