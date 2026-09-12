/** Isolated prompt comparison. Does not change application settings or post text. */
import { getLlama, LlamaChatSession } from 'node-llama-cpp'
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs'

const { COMPARE_MODEL, COMPARE_REPORT, CORPUS_MANIFEST } = process.env
if (!COMPARE_MODEL || !COMPARE_REPORT || !CORPUS_MANIFEST) throw new Error('Set model, report and corpus paths')
const manifest = JSON.parse(readFileSync(CORPUS_MANIFEST, 'utf8'))
const entries = Array.isArray(manifest) ? manifest : manifest.samples
if (!Array.isArray(entries)) throw new Error('Unsupported corpus manifest')
const cases = entries.map(item => ({ id: item.id, text: item.reference ?? item.text, set: 'development' }))
const prompts = {
  current: text => `将以下文本翻译为繁体中文，用自然流畅的台湾繁体中文口语；完整保留原意、否定、数字、时态和说话者。未说完的内容不要补完，不添加原文没有的信息。${/配信|クリア/.test(text) ? '在直播或游戏语境中，配信译为直播，クリア译为通关。' : ''}只输出译文，不要额外解释：\n\n${text}`,
  neutral: text => `将以下文本翻译为繁体中文；完整保留原意、否定、数字、时态和说话者。未说完的内容不要补完，不添加原文没有的信息。只输出译文，不要额外解释：\n\n${text}`,
  concise: text => `忠实翻译成台湾繁体中文，保留否定、时态、人物和未完成的句子。只输出译文：\n\n${text}`,
  official: text => `将以下文本翻译为繁体中文，注意只需要输出翻译后的结果，不要额外解释：\n\n${text}`
}
writeFileSync(COMPARE_REPORT, JSON.stringify({ type: 'metadata', purpose: 'Prompt development, not a blind quality score', concurrentLoad: true, date: new Date().toISOString() }) + '\n')
const llama = await getLlama({ gpu: 'metal' })
const model = await llama.loadModel({ modelPath: COMPARE_MODEL })
const context = await model.createContext({ contextSize: 2048 })
const sequence = context.getSequence()
const session = new LlamaChatSession({ contextSequence: sequence })
try {
  for (const [index, item] of cases.entries()) {
    // Counterbalance order to avoid always assigning one prompt the colder cache.
    const alternative = process.env.COMPARE_PROMPT || 'concise'
    const names = index % 2 ? [alternative, 'current'] : ['current', alternative]
    for (const variant of names) {
      session.setChatHistory([])
      const start = performance.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)
      let result
      try {
        const output = await session.promptWithMeta(prompts[variant](item.text), {
          temperature: 0, maxTokens: Math.min(512, Math.max(64, item.text.length * 4 + 32)),
          repeatPenalty: { penalty: 1.05 }, signal: controller.signal
        })
        result = { translated: output.responseText, stopReason: output.stopReason }
      } catch (error) { result = { error: String(error) } }
      finally { clearTimeout(timer) }
      const record = { type: 'trial', ...item, variant, ms: performance.now() - start, ...result }
      appendFileSync(COMPARE_REPORT, JSON.stringify(record) + '\n')
      console.log(item.id, variant, Math.round(record.ms), result.translated || result.error)
    }
  }
} finally {
  session.dispose(); sequence.dispose(); await context.dispose(); await model.dispose(); await llama.dispose()
}
appendFileSync(COMPARE_REPORT, JSON.stringify({ type: 'complete', date: new Date().toISOString() }) + '\n')
