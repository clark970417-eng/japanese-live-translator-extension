import { expect, it } from 'vitest'
import { isImplausibleTranscript } from './transcript-guard'
it('rejects the short-audio repetition that blocked translation for a minute', () => {
 expect(isImplausibleTranscript('北朝鮮の中での'+ '国民の'.repeat(70), .8)).toBe(true)
 expect(isImplausibleTranscript('北朝鮮の挑発行為に対する日本政府や他国の反応が注目されます', 5.47)).toBe(false)
})
it('keeps brief repeated reactions and normal fast speech', () => {
 for(const text of ['ああああ！','やばいやばいやばい！','待って待って！']) expect(isImplausibleTranscript(text, .8)).toBe(false)
 expect(isImplausibleTranscript('ご視聴ありがとうございました', 2)).toBe(false)
})
