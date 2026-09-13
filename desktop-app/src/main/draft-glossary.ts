import type { GlossaryEntry } from '../engines/types'

/** Platform vocabulary for written Chinese to Japanese drafts.
 *
 * A general model renders these as descriptions instead of the words a Japanese
 * viewer writes, such as `配信の記録` for a stream archive. Entries here have
 * one obvious platform meaning. Words whose meaning depends on the sentence are
 * resolved by `selectDraftTerminology` instead of being listed.
 *
 * Terminology reaches the model in the prompt, and `slm-worker.ts` keeps only
 * the entries whose source term is present in the text being translated.
 */
export const DRAFT_ZH_JA_GLOSSARY: GlossaryEntry[] = [
  { source: '直播存檔', target: 'アーカイブ' },
  { source: '直播', target: '配信' },
  { source: '開台', target: '配信開始' },
  { source: '停更', target: '更新停止' },
  { source: '留言', target: 'コメント' },
  { source: '訂閱', target: 'チャンネル登録' },
  { source: '超級留言', target: 'スーパーチャット' },
  { source: '剪輯', target: '切り抜き' }
]

/** `存檔` is a stream archive when the sentence is about watching a stream and a
 * game save when it is about playing. The two sides are scored from the whole
 * comment; with no clear winner the word gets no terminology at all and the
 * model decides, rather than being forced either way. */
const ARCHIVE_EVIDENCE: Array<[RegExp, number]> = [
  [/直播|開台|關台|配信|回放|重播|首播/, 1],
  // Watching it, keeping it, or keeping a part of a stream in it.
  [/看.{0,4}存檔|存檔.{0,6}(?:看|保留|留著|還在|刪)|(?:這段|那段|片段|留在).{0,4}存檔/, 2]
]
const SAVE_EVIDENCE: Array<[RegExp, number]> = [
  [/遊戲|關卡|魔王|破關|打到|重來|讀檔|進度|角色|裝備|副本|任務|存檔點/, 1],
  [/(?:忘記|忘了|隨時|可以|先|記得|沒有?)存檔|存檔(?:點|位|欄)/, 2]
]
const score = (text: string, evidence: Array<[RegExp, number]>): number =>
  evidence.reduce((total, [pattern, weight]) => total + (pattern.test(text) ? weight : 0), 0)

/** A stage in a game: 最後一關, 這關, 下一關, 第三關. `關` followed by a character
 * that makes it another word, as in 關係, 關於, 關心, 開關, is not matched. */
const STAGE_COUNTER = /(最後一關|這一關|這關|那一關|那關|下一關|上一關|第([一二三四五六七八九十\d]+)關)(?![係於心門注鍵])/g
const CHINESE_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
const stageNumber = (value: string): string => {
  if (/^\d+$/.test(value)) return value
  if (value === '十') return '10'
  if (value.startsWith('十')) return String(10 + (CHINESE_DIGITS[value[1]] ?? 0))
  if (value.endsWith('十')) return String((CHINESE_DIGITS[value[0]] ?? 1) * 10)
  if (value.length === 3 && value[1] === '十') return String(CHINESE_DIGITS[value[0]] * 10 + CHINESE_DIGITS[value[2]])
  return value.length === 1 && CHINESE_DIGITS[value] ? String(CHINESE_DIGITS[value]) : value
}
const STAGE_TARGET: Record<string, string> = {
  最後一關: '最後のステージ', 這一關: 'このステージ', 這關: 'このステージ', 那一關: 'あのステージ',
  那關: 'あのステージ', 下一關: '次のステージ', 上一關: '前のステージ'
}

const STOP_UPDATING_REQUEST = /(?:不要|別再|別|不准)停更/g

/** Terminology for one written draft, chosen from what the comment says. */
export function selectDraftTerminology(source: string): GlossaryEntry[] {
  const terms: GlossaryEntry[] = [...DRAFT_ZH_JA_GLOSSARY]

  if (source.includes('存檔')) {
    const archive = score(source, ARCHIVE_EVIDENCE), save = score(source, SAVE_EVIDENCE)
    if (archive > save) terms.push({ source: '存檔', target: 'アーカイブ' })
    else if (save > archive) terms.push({ source: '存檔點', target: 'セーブポイント' }, { source: '存檔', target: 'セーブ' })
  }

  // Asking a creator not to stop updating is a request. With only the noun
  // 更新停止 on offer the model has written it as a statement, 更新を停止しません,
  // so a prohibition directly before 停更 gets the request form instead.
  // Offering the noun as well gave the model two conflicting renderings, so the
  // request form replaces it rather than joining it.
  const requests = [...source.matchAll(STOP_UPDATING_REQUEST)]
  if (requests.length) terms.splice(terms.findIndex(term => term.source === '停更'), 1)
  for (const [match] of requests) terms.push({ source: match, target: '更新をやめないで' })

  const stages = [...source.matchAll(STAGE_COUNTER)]
  for (const [match, , number] of stages) {
    terms.push({ source: match, target: number ? `ステージ${stageNumber(number)}` : STAGE_TARGET[match] })
  }
  if (stages.length && source.includes('機關')) terms.push({ source: '機關', target: 'ギミック' })

  // Longer sources first, so a compound is offered before a word inside it.
  return terms.filter((term, index) => terms.findIndex(other => other.source === term.source) === index)
    .sort((a, b) => b.source.length - a.source.length)
}
