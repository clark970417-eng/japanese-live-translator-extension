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
