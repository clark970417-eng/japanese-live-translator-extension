import { expect, it } from 'vitest'
import { selectDraftTerminology } from './draft-glossary'

const target = (source: string, term: string): string | undefined =>
  selectDraftTerminology(source).find(entry => entry.source === term)?.target

it('reads 存檔 as a stream archive when the comment is about watching', () => {
  expect(target('晚點回來看存檔', '存檔')).toBe('アーカイブ')
  expect(target('那段開台的存檔還在嗎', '存檔')).toBe('アーカイブ')
})

it('reads 存檔 as a game save when the comment is about playing', () => {
  expect(target('打魔王前記得存檔', '存檔')).toBe('セーブ')
  expect(target('存檔點在哪裡', '存檔點')).toBe('セーブポイント')
})

it('gives 存檔 no terminology when the comment does not say which', () => {
  expect(target('存檔怎麼了', '存檔')).toBeUndefined()
})

it('never offers stream vocabulary for look-alike words', () => {
  const terms = selectDraftTerminology('銀行存款不夠，把檔案存到桌面').map(entry => entry.source)
  expect(terms).not.toContain('存檔')
})

it('maps stage counters and leaves other words that contain 關 alone', () => {
  expect(target('只剩最後一關了', '最後一關')).toBe('最後のステージ')
  expect(target('第十二關好難', '第十二關')).toBe('ステージ12')
  expect(target('第三關的機關', '機關')).toBe('ギミック')
  const unrelated = selectDraftTerminology('我們的關係很好，燈的開關在門邊').map(entry => entry.target)
  expect(unrelated.some(value => value.includes('ステージ'))).toBe(false)
})

it('reads keeping a part of a stream in 存檔 as the archive', () => {
  expect(target('這段可以留在存檔裡嗎', '存檔')).toBe('アーカイブ')
})

it('offers a compound before a word inside it', () => {
  const sources = selectDraftTerminology('直播存檔').map(entry => entry.source)
  expect(sources.indexOf('直播存檔')).toBeLessThan(sources.indexOf('直播'))
})
