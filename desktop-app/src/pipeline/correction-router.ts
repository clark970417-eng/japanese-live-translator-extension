/** PROTOTYPE, not wired into production. See RETEST-CORRECTION-ROUTE.md.
 *
 * Optional final correction of a caption by a slower, more accurate model. The
 * immediate caption is already shown; this only decides whether a better
 * translation may replace it. Three rules keep it from hurting live captions:
 *
 * - `submit` never waits. The correction runs elsewhere and the caption path
 *   continues immediately.
 * - A correction past its deadline is aborted and never published, even if the
 *   model answers late.
 * - Only the newest finalized caption may be corrected. A newer caption aborts
 *   the older correction, and a correction that finishes after a newer caption
 *   exists is discarded, so an older correction never replaces a newer caption
 *   in either the single-caption or the four-caption display.
 */

export type CorrectionOutcome = 'published' | 'unchanged' | 'deadline' | 'superseded' | 'stopped' | 'failed'

export interface CorrectionRouterOptions {
  /** Produce the corrected translation. Must honor the signal where it can. */
  correct: (source: string, signal: AbortSignal) => Promise<string>
  /** Replace the caption for `segment` with `translation`. */
  publish: (segment: string, translation: string) => void
  deadlineMs: number
  onOutcome?: (segment: string, outcome: CorrectionOutcome, elapsedMs: number) => void
}

class CorrectionAbort extends Error {
  constructor(readonly outcome: CorrectionOutcome) { super(outcome) }
}

export class CorrectionRouter {
  private newest: string | null = null
  private active: AbortController | null = null

  constructor(private readonly options: CorrectionRouterOptions) {}

  submit(segment: string, source: string, immediate: string): void {
    this.newest = segment
    this.active?.abort(new CorrectionAbort('superseded'))
    const controller = new AbortController()
    this.active = controller
    const started = performance.now()
    const timer = setTimeout(() => controller.abort(new CorrectionAbort('deadline')), this.options.deadlineMs)
    const settle = (outcome: CorrectionOutcome): void => {
      clearTimeout(timer)
      if (this.active === controller) this.active = null
      this.options.onOutcome?.(segment, outcome, performance.now() - started)
    }
    const aborted = (): CorrectionOutcome =>
      controller.signal.reason instanceof CorrectionAbort ? controller.signal.reason.outcome : 'stopped'

    void Promise.resolve()
      .then(() => this.options.correct(source, controller.signal))
      .then(translation => {
        // Checked at publish time, not only when aborting: a model can answer
        // after the deadline or after a newer caption without seeing the signal.
        if (controller.signal.aborted) return settle(aborted())
        if (this.newest !== segment) return settle('superseded')
        if (!translation.trim() || translation.trim() === immediate.trim()) return settle('unchanged')
        this.options.publish(segment, translation)
        settle('published')
      })
      .catch(() => settle(controller.signal.aborted ? aborted() : 'failed'))
  }

  /** Stop publishing anything, for example when the caption session stops. */
  stop(): void {
    this.newest = null
    this.active?.abort(new CorrectionAbort('stopped'))
  }
}
