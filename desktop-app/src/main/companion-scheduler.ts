/** Serial model access, with bounded preference for live audio over page text.
 *
 * Priority alone cannot protect live captions: a page-text operation that has
 * already entered the serial slot may make several model calls. Arriving audio
 * therefore asks the active page-text operation to release its optional work
 * through the signal passed to it. An operation that ignores the signal keeps
 * the previous behavior.
 */
export class CompanionScheduler {
  private high: Array<(preempt: AbortSignal) => Promise<void>> = []
  private normal: Array<(preempt: AbortSignal) => Promise<void>> = []
  private active = false
  /** Preemption handle for the active page-text operation; null while audio runs. */
  private activePreemption: AbortController | null = null
  private highStreak = 0
  private idleWaiters: Array<() => void> = []

  run<T>(audioPriority: boolean, operation: (preempt: AbortSignal) => Promise<T>): Promise<T> {
    const result = new Promise<T>((resolve, reject) => {
      const task = async (preempt: AbortSignal): Promise<void> => {
        try { resolve(await operation(preempt)) } catch (error) { reject(error) }
      }
      ;(audioPriority ? this.high : this.normal).push(task)
    })
    if (audioPriority) this.activePreemption?.abort(new Error('Preempted by live audio'))
    void this.pump()
    return result
  }

  /** Ask the active page-text operation to release optional work now, as
   * arriving audio would. Used when its client has gone away. */
  preemptActive(reason: Error): void {
    this.activePreemption?.abort(reason)
  }

  idle(): Promise<void> {
    return !this.active && !this.high.length && !this.normal.length
      ? Promise.resolve() : new Promise(resolve => this.idleWaiters.push(resolve))
  }

  private async pump(): Promise<void> {
    if (this.active) return
    this.active = true
    try {
      while (this.high.length || this.normal.length) {
        const useHigh = this.high.length > 0 && (this.highStreak < 4 || !this.normal.length)
        const task = (useHigh ? this.high : this.normal).shift()!
        this.highStreak = useHigh ? this.highStreak + 1 : 0
        const preemption = new AbortController()
        this.activePreemption = useHigh ? null : preemption
        try { await task(preemption.signal) } finally { this.activePreemption = null }
      }
    } finally {
      this.active = false
      this.highStreak = 0
      this.idleWaiters.splice(0).forEach(resolve => resolve())
    }
  }
}
