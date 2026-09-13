/** Conservative repair for meaning a complete written draft can lose.
 *
 * Each property pairs a Chinese source signal with the Japanese forms that carry
 * it. When the source has the signal and the draft has none of those forms, the
 * draft is retranslated clause by clause, which in practice keeps both the
 * marker and the grammatical subject of each clause. This is a narrow heuristic,
 * not a general translation-quality score.
 */

interface FidelityProperty {
  name: string
  /** Does this source clause carry the property? */
  inSource: (clause: string) => boolean
  /** Does this Japanese text carry it? */
  inTarget: RegExp
  warning: string
  /** Repair only when the property is in the first clause. Uncertainty keeps
   * the 3.8.5 restriction exactly, so this change cannot widen that repair. */
  leadClauseOnly?: boolean
}

const uncertainty: FidelityProperty = {
  name: 'uncertainty',
  inSource: clause => /(?<!不)可能|也許|或許/.test(clause),
  inTarget: /かもしれ|かも[。！!\s]|とは限ら|とは限り|かどうか|可能性|おそらく|恐らく|たぶん|多分|もしか|未定|まだ.*(?:確定|決ま|わか|分か)|と思|でしょう|はず/,
  warning: '不確定語氣可能遺失，請對照原文',
  leadClauseOnly: true
}

/** A request, prohibition or reminder addressed to the reader. Each alternative
 * excludes the common words that only look like one: 不要緊 and 不要臉, 別人
 * and 特別, 請問 and 請假, and any clause whose subject is the writer. */
const addresseeDirectiveSource = new RegExp([
  '不要(?!緊|臉|钱|錢)',
  '(?:^|[你妳也就先])別(?![人的處名])',
  '請(?![問问假客教])',
  '記得|记得'
].join('|'))
const writerSubject = /我們|我们|我(?!們)/

const addresseeDirective: FidelityProperty = {
  name: 'addressee directive',
  inSource: clause => addresseeDirectiveSource.test(clause) && !writerSubject.test(clause),
  // て becomes で after ん, ぐ, ぶ, む and ぬ: 休んでください, 急いでね.
  inTarget: /ないで|ないように|ずに|[てで]ください|[てで]下さい|[てで]ね|なさい|なくていい|なくても(?:いい|大丈夫)|ように|[てで]ほしい|ましょう|[てで]おいて/,
  warning: '請求或勸告的對象可能被改成自己，請對照原文'
}

const PROPERTIES = [uncertainty, addresseeDirective]
const unsafeSplit = /如果|假如|要是|只要|除非|即使|就算|無論|不管|不是.*(?:而是|是)|[「」『』“”"（）()]/

export interface DraftFidelityResult {
  text: string
  reviewWarning?: string
  repaired?: boolean
}

/** A run of kana inside a Chinese comment is a name, a handle or quoted
 * Japanese. Two or more characters, so a lone particle is not treated as one. */
const KANA_RUN = /[\u3041-\u3096]{2,}|[\u30A1-\u30FA\u30FC]{2,}/g
const flipKana = (text: string): string => text.replace(/[\u3041-\u3096\u30A1-\u30F6]/g, char => {
  const code = char.charCodeAt(0)
  return String.fromCharCode(code <= 0x3096 ? code + 0x60 : code - 0x60)
})

const POLITE_ENDING = /(?:です|ます|ました|でした|ません|ください)(?:よ|ね|よね)?[。！？!?]?$/

/** Deterministic corrections that need no model call. Each restores a property
 * of the source the draft dropped; none rewrites meaning. */
export function finishDraft(source: string, text: string): string {
  let result = text
  // A name written in hiragana or katakana keeps that script: さくら stays さくら
  // even when the model wrote サクラ. Only an exact script-flipped copy of a
  // source run is restored, so ordinary Japanese words are never touched.
  for (const run of new Set(source.match(KANA_RUN) ?? [])) {
    if (result.includes(run)) continue
    const flipped = flipKana(run)
    if (flipped !== run && result.includes(flipped)) result = result.split(flipped).join(run)
  }
  // One sentence keeps one register. A bare ありがとう opening a sentence whose
  // last predicate is polite is raised to match it.
  result = result.replace(/[^。！？!?\n]+[。！？!?]?/g, sentence =>
    /ありがとう、/.test(sentence) && POLITE_ENDING.test(sentence) ? sentence.replace(/ありがとう、/g, 'ありがとうございます、') : sentence)
  return result
}

const REPAIR_DEADLINE_MS = 1800
const MAX_LINE_REPAIR_LINES = 4
const LINE_WARNING = '換行後的內容可能被合併或遺漏，請對照原文'
const writtenLines = (text: string): string[] => text.split('\n').filter(line => line.trim())

/** `preempt` aborts only the optional repair, never the first translation, so a
 * requested draft is always produced. A preempted repair returns the completed
 * draft with the review warning. */
export async function translateWrittenDraft(
  source: string,
  translate: (text: string, signal?: AbortSignal) => Promise<string>,
  preempt?: AbortSignal
): Promise<DraftFidelityResult> {
  const whole = await translateWrittenDraftCore(source, translate, preempt)
  const lines = writtenLines(source)
  if (lines.length < 2 || writtenLines(whole.text).length === lines.length) {
    return { ...whole, text: finishDraft(source, whole.text) }
  }
  // The writer's line breaks separate thoughts. A draft that merged or dropped
  // lines has lost structure and often content, so translate each line on its
  // own under the same deadline and preemption as clause repair.
  const unresolved = { ...whole, text: finishDraft(source, whole.text), reviewWarning: [whole.reviewWarning, LINE_WARNING].filter(Boolean).join('；') }
  if (preempt?.aborted || lines.length > MAX_LINE_REPAIR_LINES) return unresolved
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('Draft repair deadline')), REPAIR_DEADLINE_MS)
  const release = (): void => controller.abort(new Error('Preempted by live audio'))
  preempt?.addEventListener('abort', release, { once: true })
  const bounded = (text: string, signal?: AbortSignal): Promise<string> => {
    controller.signal.throwIfAborted()
    return translate(text, signal ?? controller.signal)
  }
  try {
    const outputs: DraftFidelityResult[] = []
    for (const line of source.split('\n')) {
      if (!line.trim()) { outputs.push({ text: '' }); continue }
      const output = await translateWrittenDraftCore(line.trim(), bounded, controller.signal)
      controller.signal.throwIfAborted()
      if (!output.text.trim() || writtenLines(output.text).length !== 1) return unresolved
      outputs.push({ ...output, text: output.text.trim() })
    }
    const warnings = outputs.map(output => output.reviewWarning).filter(Boolean)
    return {
      text: finishDraft(source, outputs.map(output => output.text).join('\n')),
      repaired: true,
      ...(warnings.length ? { reviewWarning: [...new Set(warnings)].join('；') } : {})
    }
  } catch {
    return unresolved
  } finally {
    clearTimeout(timer)
    preempt?.removeEventListener('abort', release)
  }
}

async function translateWrittenDraftCore(
  source: string,
  translate: (text: string, signal?: AbortSignal) => Promise<string>,
  preempt?: AbortSignal
): Promise<DraftFidelityResult> {
  const text = await translate(source)
  const parts = source.split(/[，。]/).map(part => part.trim()).filter(Boolean)
  // A property is lost when some clause carries it and the whole draft has none
  // of its target forms.
  const lost = PROPERTIES.filter(property =>
    parts.some(part => property.inSource(part)) && !property.inTarget.test(text))
  if (!lost.length) return { text }
  const unresolved = { text, reviewWarning: lost.map(property => property.warning).join('；') }
  // Live captions are already waiting for the shared worker; do not begin
  // several more model calls for optional repair.
  if (preempt?.aborted) return unresolved
  // Restrict fallback to two or three short clauses; never split conditions or
  // quoted text. This is only for complete drafts, never streaming speech.
  if (parts.length < 2 || parts.length > 3 || parts.some(part => part.length < 5 || part.length > 60) || unsafeSplit.test(source)) return unresolved
  if (lost.some(property => property.leadClauseOnly && !property.inSource(parts[0]))) return unresolved
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('Draft repair deadline')), REPAIR_DEADLINE_MS)
  const release = (): void => controller.abort(new Error('Preempted by live audio'))
  preempt?.addEventListener('abort', release, { once: true })
  try {
    const outputs: string[] = []
    for (const part of parts) {
      controller.signal.throwIfAborted()
      const output = await translate(part, controller.signal)
      if (!output.trim()) return unresolved
      // The clause that carries a lost property must now carry it; otherwise
      // the repair did not fix what it was started for.
      if (lost.some(property => property.inSource(part) && !property.inTarget.test(output))) return unresolved
      outputs.push(output)
    }
    return { text: outputs.map(output => output.trim().replace(/[、，,]$/, '')).map(output => output + (/[。！？!?]$/.test(output) ? '' : '。')).join(''), repaired: true }
  } catch {
    // Retain the completed draft if optional repair fails. Do not turn a
    // successful request into an empty result or an unbounded retry loop.
    return unresolved
  } finally {
    clearTimeout(timer)
    preempt?.removeEventListener('abort', release)
  }
}
