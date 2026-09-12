/** Reject impossible short-window decoder loops; keep genuine brief reactions. */
export function isImplausibleTranscript(text: string, audioSeconds: number): boolean {
  if (!Number.isFinite(audioSeconds) || audioSeconds <= 0) return true
  const compact = text.replace(/[\p{P}\s]/gu, '')
  // Generous multilingual rate; this catches hundreds of symbols from <1s audio.
  if (compact.length > Math.max(48, audioSeconds * 32 + 24)) return true
  const loop = /(.{2,24}?)\1{5,}/u.exec(compact)
  return !!loop && loop[0].length > Math.max(24, audioSeconds * 14)
}

/** Whisper's null output for audio without speech. Measured on this model: pure
 * digital silence and a speechless music bed both decode to these phrases with
 * `no_speech_prob` 0 and `avg_logprob` above -0.11, so neither confidence nor
 * amplitude separates them from genuine quiet speech. Only a transcript whose
 * entire content is one of these is rejected; a phrase inside a longer
 * utterance is kept. */
const OUTRO_ARTIFACTS = [
  'ご視聴ありがとうございました',
  'ご覧いただきありがとうございました',
  'チャンネル登録お願いします',
  'チャンネル登録をお願いします',
  'thanks for watching',
  'thank you for watching',
  'please subscribe'
]

export function isOutroArtifact(text: string): boolean {
  const compact = text.trim().replace(/[\s。、．，.,!！?？…]+$/u, '').toLowerCase()
  return OUTRO_ARTIFACTS.includes(compact)
}
