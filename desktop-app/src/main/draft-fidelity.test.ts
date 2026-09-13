import { expect, it, vi } from 'vitest'
import { translateWrittenDraft } from './draft-fidelity'

it('retries only a missing uncertainty marker and bounds repair to three short clauses', async () => {
  const translate = vi.fn().mockResolvedValueOnce('明日は来られません。でも録画を見ます。')
    .mockResolvedValueOnce('明日は来られないかもしれません。').mockResolvedValueOnce('でも録画を見ます。').mockResolvedValueOnce('無理しないでくださいね。')
  const source = '明天可能沒辦法來看，但我會看錄影，不要勉強自己喔'
  expect(await translateWrittenDraft(source, translate)).toEqual({text:'明日は来られないかもしれません。でも録画を見ます。無理しないでくださいね。',repaired:true})
  expect(translate.mock.calls.map(([s])=>s)).toEqual([source,'明天可能沒辦法來看','但我會看錄影','不要勉強自己喔'])
})

it.each(['明日は来られないかもしれません。','明日も来られるとは限りません。'])('leaves preserved uncertainty untouched: %s', async text => {
  const translate=vi.fn().mockResolvedValue(text)
  expect(await translateWrittenDraft('我明天可能無法來看，但我會看錄影',translate)).toEqual({text})
  expect(translate).toHaveBeenCalledTimes(1)
})

it.each(['如果明天可能會下雨，我就待在家裡','我說「明天可能無法來」，請不要等我','我不可能忘記這件事，我已經記下來了','我明天確定無法來看，但我會看錄影'])('does not split unsafe or certain source: %s', async source => {
  const translate=vi.fn().mockResolvedValue('明日は行きません。')
  await translateWrittenDraft(source,translate)
  expect(translate).toHaveBeenCalledTimes(1)
})

it('retains the original draft with a specific warning when repair fails', async () => {
  const translate=vi.fn().mockResolvedValueOnce('明日は来られません。').mockRejectedValueOnce(new Error('timeout'))
  expect(await translateWrittenDraft('明天可能沒辦法來看，但我會看直播存檔',translate)).toMatchObject({text:'明日は来られません。',reviewWarning:expect.any(String)})
  expect(translate).toHaveBeenCalledTimes(2)
})

it('does not accept a first-clause retry which still loses uncertainty', async () => {
  const translate=vi.fn().mockResolvedValue('明日は来られません。')
  expect(await translateWrittenDraft('明天可能沒辦法來看，但我會看直播存檔',translate)).toHaveProperty('reviewWarning')
  expect(translate).toHaveBeenCalledTimes(2)
})


it('cancels overdue repair inference and returns the completed original draft', async () => {
  vi.useFakeTimers()
  try {
    const translate=vi.fn().mockResolvedValueOnce('明日は来られません。').mockImplementationOnce((_text, signal: AbortSignal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})))
    const pending=translateWrittenDraft('明天可能沒辦法來看，但我會看直播存檔',translate)
    await vi.advanceTimersByTimeAsync(1801)
    expect(await pending).toMatchObject({text:'明日は来られません。',reviewWarning:expect.any(String)})
    expect(translate.mock.calls[1][1].aborted).toBe(true)
  } finally {vi.useRealTimers()}
})

it('does not interpret a quantifier as missing possibility', async () => {
  const translate=vi.fn().mockResolvedValue('全てに返信できるわけではありません。')
  expect(await translateWrittenDraft('我不一定會回覆全部訊息，但我都有看到',translate)).toEqual({text:'全てに返信できるわけではありません。'})
  expect(translate).toHaveBeenCalledTimes(1)
})

it('repairs a request whose subject was turned into the writer, clause by clause', async () => {
  const source = '明天可能沒辦法來看，但我會看直播存檔，不要勉強自己喔'
  const translate = vi.fn()
    .mockResolvedValueOnce('明日は来られないかもしれませんが、アーカイブを視聴しますので、無理にはしませんよ。')
    .mockResolvedValueOnce('明日は来られないかもしれません。')
    .mockResolvedValueOnce('でもアーカイブを見ます。')
    .mockResolvedValueOnce('無理しないでくださいね。')
  expect(await translateWrittenDraft(source, translate)).toEqual({
    text: '明日は来られないかもしれません。でもアーカイブを見ます。無理しないでくださいね。', repaired: true
  })
})

it.each([
  ['我今天不要熬夜了，明天還要上班', '今日は夜更かししません、明日は仕事です。'],
  ['我們今天先不要打那個魔王', '今日はその魔王と戦うのはやめておきます。'],
  ['遲到一點不要緊', '少し遅れても大丈夫です。'],
  ['別人的意見聽聽就好', '他人の意見は参考程度でいいです。'],
  ['請問這首歌叫什麼名字', 'この曲のタイトルは何ですか？'],
  ['今天的服裝特別好看', '今日の服装は特に素敵です。']
])('does not treat the writer or a look-alike word as a request: %s', async (source, text) => {
  const translate = vi.fn().mockResolvedValue(text)
  expect(await translateWrittenDraft(source, translate)).toEqual({ text })
  expect(translate).toHaveBeenCalledTimes(1)
})

it('keeps the draft with a warning when the repaired request clause is still not a request', async () => {
  const translate = vi.fn()
    .mockResolvedValueOnce('今日はお疲れさまでした。夜更かしはしません。')
    .mockResolvedValueOnce('今日はお疲れさまでした。')
    .mockResolvedValueOnce('夜更かしはしません。')
  const result = await translateWrittenDraft('今天辛苦了，不要熬夜太晚喔', translate)
  expect(result).toMatchObject({ text: '今日はお疲れさまでした。夜更かしはしません。', reviewWarning: expect.stringContaining('對象') })
  expect(result.repaired).toBeFalsy()
})

it('leaves a request that already reads as a request untouched', async () => {
  const translate = vi.fn().mockResolvedValue('今日はお疲れさまでした。夜更かししすぎないようにしてくださいね。')
  expect(await translateWrittenDraft('今天辛苦了，不要熬夜太晚喔', translate)).toEqual({
    text: '今日はお疲れさまでした。夜更かししすぎないようにしてくださいね。'
  })
  expect(translate).toHaveBeenCalledTimes(1)
})

it.each(['どうぞゆっくり休んでください', '急いでね', '水を飲んでおいて'])('accepts the voiced te-form as a request: %s', async text => {
  const translate = vi.fn().mockResolvedValue(text)
  expect(await translateWrittenDraft('今天很開心，請好好休息', translate)).toEqual({ text })
  expect(translate).toHaveBeenCalledTimes(1)
})
