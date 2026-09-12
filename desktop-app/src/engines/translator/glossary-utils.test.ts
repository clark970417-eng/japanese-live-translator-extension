import { expect, it } from 'vitest'
import { selectApplicableGlossary, formatGlossaryPrompt } from './glossary-utils'

const glossary = [
  { source: 'アーカイブ', target: '直播存檔' },
  { source: 'リスポーン', target: '重生' }
]

it('passes only glossary terms the sentence actually contains', () => {
  expect(selectApplicableGlossary('アーカイブで見てください。', glossary))
    .toEqual([{ source: 'アーカイブ', target: '直播存檔' }])
  // An unused term must not reach the prompt, where the model may insert it.
  expect(selectApplicableGlossary('今日は雨ですね。', glossary)).toBeUndefined()
  expect(selectApplicableGlossary('リスポーンしてアーカイブを見る', glossary)).toHaveLength(2)
  expect(selectApplicableGlossary('any text', undefined)).toBeUndefined()
  expect(selectApplicableGlossary('any text', [])).toEqual([])
})

it('produces no terminology section when nothing applies', () => {
  expect(formatGlossaryPrompt(selectApplicableGlossary('今日は雨ですね。', glossary))).toBe('')
  expect(formatGlossaryPrompt(selectApplicableGlossary('アーカイブを見る', glossary)))
    .toContain('直播存檔')
})
