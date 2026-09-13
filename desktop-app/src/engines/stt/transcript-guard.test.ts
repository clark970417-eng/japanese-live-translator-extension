import { expect, it } from 'vitest'
import { isImplausibleTranscript, isOutroArtifact } from './transcript-guard'
it('rejects the short-audio repetition that blocked translation for a minute', () => {
 expect(isImplausibleTranscript('北朝鮮の中での'+ '国民の'.repeat(70), .8)).toBe(true)
 expect(isImplausibleTranscript('北朝鮮の挑発行為に対する日本政府や他国の反応が注目されます', 5.47)).toBe(false)
})
it('keeps brief repeated reactions and normal fast speech', () => {
 for(const text of ['ああああ！','やばいやばいやばい！','待って待って！']) expect(isImplausibleTranscript(text, .8)).toBe(false)
 expect(isImplausibleTranscript('ご視聴ありがとうございました', 2)).toBe(false)
})

it('rejects a whole-transcript outro artifact but keeps genuine speech', () => {
  expect(isOutroArtifact('ご視聴ありがとうございました')).toBe(true)
  expect(isOutroArtifact('ご視聴ありがとうございました。')).toBe(true)
  expect(isOutroArtifact(' Thanks for watching! ')).toBe(true)
  // A phrase inside a longer utterance is real speech and must survive.
  expect(isOutroArtifact('今日もご視聴ありがとうございました、また明日ね')).toBe(false)
  expect(isOutroArtifact('ありがとうございます')).toBe(false)
  expect(isOutroArtifact('よろしくお願いします')).toBe(false)
  expect(isOutroArtifact('はい。')).toBe(false)
})

it('keeps an outro only with enough speech evidence for its own audio', async () => {
  const { isUnspokenOutro, speechEvidenceFor, OUTRO_MIN_SPEECH_SECONDS } = await import('./transcript-guard')
  expect(OUTRO_MIN_SPEECH_SECONDS).toBe(1.0)
  expect(isUnspokenOutro('ご視聴ありがとうございました', { speechSeconds: 1.98 })).toBe(false)
  expect(isUnspokenOutro('ご視聴ありがとうございました', { speechSeconds: 1.0 })).toBe(false)
  expect(isUnspokenOutro('ご視聴ありがとうございました', { speechSeconds: 0.13 })).toBe(true)
  expect(isUnspokenOutro('ご視聴ありがとうございました', { speechSeconds: 0 })).toBe(true)
  expect(isUnspokenOutro('ご視聴ありがとうございました')).toBe(true)
  expect(isUnspokenOutro('ご視聴ありがとうございました', { speechSeconds: Number.NaN })).toBe(true)
  // Evidence never affects other text.
  expect(isUnspokenOutro('こんにちは', { speechSeconds: 0 })).toBe(false)
  expect(isUnspokenOutro('こんにちは')).toBe(false)
})

it('accepts speech evidence only when it can describe the audio it arrived with', async () => {
  const { speechEvidenceFor } = await import('./transcript-guard')
  expect(speechEvidenceFor(1.5, 2)).toEqual({ speechSeconds: 1.5 })
  expect(speechEvidenceFor(0, 2)).toEqual({ speechSeconds: 0 })
  expect(speechEvidenceFor(2, 2)).toEqual({ speechSeconds: 2 })
  for (const value of [undefined, null, '1.5', -0.1, Number.NaN, Number.POSITIVE_INFINITY, { speechSeconds: 2 }, [2], 2.5]) {
    expect(speechEvidenceFor(value, 2)).toBeUndefined()
  }
  expect(speechEvidenceFor(1, Number.NaN)).toBeUndefined()
})
