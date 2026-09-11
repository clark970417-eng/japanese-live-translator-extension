import { describe, it, expect, vi } from 'vitest'
import { resetTranslationHistory } from './translation-session'
describe('translation chat history', () => {
  it('removes the default system prompt and previous turns for HY-MT1.5', () => {
    const session = { setChatHistory: vi.fn(), resetChatHistory: vi.fn() }
    resetTranslationHistory(session, 'hunyuan-mt-15')
    resetTranslationHistory(session, 'hunyuan-mt-15')
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
