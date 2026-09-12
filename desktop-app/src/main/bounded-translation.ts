/** Expected user/session cancellation, distinct from a damaged inference state. */
export class TranslationCancelledError extends Error {
 constructor() { super('Translation cancelled'); this.name = 'TranslationCancelledError' }
}

/** A timeout must abort inference itself, not just abandon the waiting UI. */
export async function boundedTranslation(
 session: { promptWithMeta(prompt: string, options: any): Promise<{responseText:string,stopReason:string}> },
 prompt: string,
 options: Record<string, unknown>,
 sourceLength?: number,
 timeoutMs = 15_000,
 externalSignal?: AbortSignal
): Promise<string> {
 const controller = new AbortController()
 const cancel = (): void => controller.abort(new TranslationCancelledError())
 externalSignal?.addEventListener('abort', cancel, {once:true})
 if(externalSignal?.aborted)cancel()
 const timer = setTimeout(() => controller.abort(new Error('Translation timed out')), timeoutMs)
 try {
  const maxTokens = sourceLength === undefined ? Number(options.maxTokens || 512)
    : Math.min(Number(options.maxTokens || 512), Math.max(64, sourceLength * 4 + 32))
  const result = await session.promptWithMeta(prompt, {...options,maxTokens,signal:controller.signal})
  if(controller.signal.aborted)throw controller.signal.reason
  if(result.stopReason === 'abort')throw new Error('Translation timed out')
  if(result.stopReason === 'maxTokens')throw new Error('Translation exceeded its output limit')
  return result.responseText
 } finally { clearTimeout(timer); externalSignal?.removeEventListener('abort',cancel) }
}
