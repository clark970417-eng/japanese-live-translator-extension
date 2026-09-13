import { describe, expect, it } from 'vitest'
import { buildJaZhFidelityGuidance, finishJaZhTranslation } from './ja-zh-fidelity'

describe('Japanese to Traditional Chinese fidelity', () => {
  it('only adds guidance for properties present in the source', () => {
    expect(buildJaZhFidelityGuidance('今日は晴れです。')).toBe('')
    expect(buildJaZhFidelityGuidance('リスポーン地点を変えるらしい。')).toContain('重生點')
    expect(buildJaZhFidelityGuidance('リスポーン地点を変えるらしい。')).toContain('聽說')
  })

  it('repairs stream and game terms without changing unrelated output', () => {
    expect(finishJaZhTranslation('リスポーン地点を変えます。', '改變回程的地点。')).toBe('改變重生點。')
    expect(finishJaZhTranslation('リスポーン地点を変えます。', '改變重生的地點。')).toBe('改變重生點。')
    expect(finishJaZhTranslation('昨日のアーカイブです。', '這是昨天的檔案。')).toBe('這是昨天的直播存檔。')
    expect(finishJaZhTranslation('今日は晴れです。', '今天天氣晴朗。')).toBe('今天天氣晴朗。')
    expect(finishJaZhTranslation('リスポーン地点へ戻ります。', '回到リスポーン點。')).toBe('回到重生點。')
    expect(finishJaZhTranslation('切り抜きはアーカイブ公開後にお願いします。', '請在資源公開之後再進行切斷處理。')).toBe('請在直播存檔公開後再進行剪輯。')
    expect(finishJaZhTranslation('切り抜きはアーカイブ公開後にお願いします。', '請在「直播存檔公開後」進行切り抜き處理。')).toBe('請在「直播存檔公開後」進行剪輯。')
    expect(finishJaZhTranslation('課金しなくても楽しめます。', '不付課金也能享受。')).toBe('不課金也能享受。')
    expect(finishJaZhTranslation('無理なら先に帰っていいよ。', '如果不行，那麼就先回去吧。')).toBe('如果不行，可以先回去喔。')
  })

  it('retains source-proven hearsay and does not add it to assertions', () => {
    expect(finishJaZhTranslation('弱体化されるらしい。', '似乎真的會被削弱。')).toBe('聽說會被削弱。')
    expect(finishJaZhTranslation('次の更新で弱体化されるらしい。', '在下次更新中，它似乎會被削弱。')).toBe('聽說在下次更新中，它會被削弱。')
    expect(finishJaZhTranslation('弱体化されます。', '會被削弱。')).toBe('會被削弱。')
  })

  it('repairs the common ended/spoke ambiguity and trailing action invention', () => {
    expect(finishJaZhTranslation('まだ終わったとは言ってないよ。', '還沒有說完呢。')).toBe('我還沒說已經結束了喔。')
    expect(finishJaZhTranslation('このあと予定があるから、そろそろ', '等等有安排，所以差不多該走了吧。')).toBe('等等有安排，所以差不多該……')
    expect(finishJaZhTranslation('いや、それはちょっと違うというか', '不，那有點不一樣吧。')).toBe('不，那有點不一樣，該怎麼說……')
  })
})
