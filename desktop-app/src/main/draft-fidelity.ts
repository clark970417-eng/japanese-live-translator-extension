/** Conservative repair for a lost uncertainty marker in a complete written draft.
 * This is a narrow heuristic, not a general translation-quality score.
 */
const sourceUncertainty = /(?<!不)可能|也許|或許/
const targetUncertainty = /かもしれ|かも[。！!\s]|とは限ら|とは限り|かどうか|可能性|おそらく|恐らく|たぶん|多分|もしか|未定|まだ.*(?:確定|決ま|わか|分か)|と思|でしょう|はず/
const unsafeSplit = /如果|假如|要是|只要|除非|即使|就算|無論|不管|不是.*(?:而是|是)|[「」『』“”"（）()]/

export interface DraftFidelityResult {
  text: string
  reviewWarning?: string
  repaired?: boolean
}

export async function translateWrittenDraft(
  source: string,
  translate: (text: string, signal?: AbortSignal) => Promise<string>
): Promise<DraftFidelityResult> {
  const text = await translate(source)
  if (!sourceUncertainty.test(source) || targetUncertainty.test(text)) return { text }
  const unresolved = { text, reviewWarning: '不確定語氣可能遺失，請對照原文' }
  // Restrict fallback to two or three short clauses; never split conditions or
  // quoted text. This is only for complete drafts, never streaming speech.
  const parts = source.split(/[，。]/).map(part => part.trim()).filter(Boolean)
  if (parts.length < 2 || parts.length > 3 || parts.some(part => part.length < 5 || part.length > 60) || unsafeSplit.test(source) || !sourceUncertainty.test(parts[0])) return unresolved
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('Draft repair deadline')), 1800)
  try {
    const first = await translate(parts[0], controller.signal)
    if (!first.trim() || !targetUncertainty.test(first)) return unresolved
    const outputs = [first]
    for (const part of parts.slice(1)) {
      controller.signal.throwIfAborted()
      const output = await translate(part, controller.signal)
      if (!output.trim()) return unresolved
      outputs.push(output)
    }
    return { text: outputs.map(output => output.trim().replace(/[、，,]$/, '')).map(output => output + (/[。！？!?]$/.test(output) ? '' : '。')).join(''), repaired: true }
  } catch {
    // Retain the completed draft if optional repair fails. Do not turn a
    // successful request into an empty result or an unbounded retry loop.
    return unresolved
  } finally {
    clearTimeout(timer)
  }
}
