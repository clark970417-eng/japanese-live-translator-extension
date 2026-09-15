/**
 * Pick the next cascade decode interval.  Start aggressively so the first
 * caption appears quickly, then back off for long utterances so a slower STT
 * engine does not accumulate redundant rolling-window work.
 */
export function getAdaptiveStreamingDelay(baseIntervalMs: number, speechElapsedMs: number): number {
  const base = Math.max(500, Math.min(3000, baseIntervalMs))
  if (speechElapsedMs < 1800) return Math.min(base, 500)
  if (speechElapsedMs < 5000) return base
  return Math.max(base, 1100)
}
