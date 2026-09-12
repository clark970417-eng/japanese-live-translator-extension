/** Reject impossible short-window decoder loops; keep genuine brief reactions. */
export function isImplausibleTranscript(text: string, audioSeconds: number): boolean {
  if (!Number.isFinite(audioSeconds) || audioSeconds <= 0) return true
  const compact = text.replace(/[\p{P}\s]/gu, '')
  // Generous multilingual rate; this catches hundreds of symbols from <1s audio.
  if (compact.length > Math.max(48, audioSeconds * 32 + 24)) return true
  const loop = /(.{2,24}?)\1{5,}/u.exec(compact)
  return !!loop && loop[0].length > Math.max(24, audioSeconds * 14)
}
