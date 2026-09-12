import { describe, it, expect, vi } from 'vitest'
import { resetTranslationHistory, translationContextForModel } from './translation-session'
describe('translation chat history', () => {
  it.each(['hunyuan-mt-15','hunyuan-mt-2'])('removes the default system prompt and previous turns for %s', modelType => {
    const session = { setChatHistory: vi.fn(), resetChatHistory: vi.fn() }
    resetTranslationHistory(session, modelType)
    resetTranslationHistory(session, modelType)
    expect(session.setChatHistory).toHaveBeenCalledTimes(2)
    expect(session.setChatHistory).toHaveBeenLastCalledWith([])
    expect(session.resetChatHistory).not.toHaveBeenCalled()
  })
  it('preserves configured system instructions for other models', () => {
    const session = { setChatHistory: vi.fn(), resetChatHistory: vi.fn() }
    resetTranslationHistory(session, 'lfm2')
    expect(session.resetChatHistory).toHaveBeenCalledOnce()
    expect(session.setChatHistory).not.toHaveBeenCalled()
  })
})

it('omits prior utterances for translation models while preserving terminology', () => {
  const context = { previousSegments: [{ source: 'Previous sentence', translated: 'Old output' }], glossary: [{ source: '配信', target: '直播' }] }
  expect(translationContextForModel(context, 'hunyuan-mt-15')).toEqual({ previousSegments: [], glossary: context.glossary })
  expect(translationContextForModel(context, 'hunyuan-mt-2')?.previousSegments).toEqual([])
  expect(context.previousSegments).toHaveLength(1)
  expect(translationContextForModel(context, 'lfm2')).toBe(context)
})
