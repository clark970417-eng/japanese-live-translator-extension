/** HY-MT1.5 is trained with user-only translation prompts, not the wrapper's
 * default helpful-assistant system message. Clear it on creation and reuse. */
export function resetTranslationHistory(
  session: { setChatHistory(history: []): void; resetChatHistory(): void },
  modelType: string
): void {
  if (modelType === 'hunyuan-mt-15') session.setChatHistory([])
  else session.resetChatHistory()
}
