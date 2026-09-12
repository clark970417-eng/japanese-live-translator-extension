/** Serial model access, with bounded preference for live audio over page text. */
export class CompanionScheduler {
  private high: Array<() => Promise<void>> = []
  private normal: Array<() => Promise<void>> = []
  private active = false
  private highStreak = 0
  private idleWaiters: Array<() => void> = []

  run<T>(audioPriority: boolean, operation: () => Promise<T>): Promise<T> {
    const result = new Promise<T>((resolve, reject) => {
      const task = async (): Promise<void> => {
        try { resolve(await operation()) } catch (error) { reject(error) }
      }
      ;(audioPriority ? this.high : this.normal).push(task)
    })
    void this.pump()
    return result
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
        await task()
      }
    } finally {
      this.active = false
      this.highStreak = 0
      this.idleWaiters.splice(0).forEach(resolve => resolve())
    }
  }
}
