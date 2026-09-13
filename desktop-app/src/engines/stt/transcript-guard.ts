import type { SpeechEvidence } from '../types'

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

/** Voiced seconds a chunk needs before its outro transcript counts as spoken.
 * Declared in `tests/corpus/outro-rule.json` (`secondMethod.minVoicedSeconds`)
 * before the frozen outro set was measured; do not tune it on that set. */
export const OUTRO_MIN_SPEECH_SECONDS = 1.0

/** An outro transcript is kept only when the audio it came from carries enough
 * detected speech. Without evidence, as from a caller that has no voice
 * activity detector, it is rejected exactly as before. */
export function isUnspokenOutro(text: string, evidence?: SpeechEvidence): boolean {
  if (!isOutroArtifact(text)) return false
  return !(evidence && Number.isFinite(evidence.speechSeconds) && evidence.speechSeconds >= OUTRO_MIN_SPEECH_SECONDS)
}

/** Evidence from an untrusted message, or undefined when it cannot describe
 * this audio: not a number, negative, or longer than the audio itself. */
export function speechEvidenceFor(value: unknown, audioSeconds: number): SpeechEvidence | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  // The browser counts frames of this audio, so a larger value is not about it.
  if (!Number.isFinite(audioSeconds) || value > audioSeconds + 1e-6) return undefined
  return { speechSeconds: value }
}
