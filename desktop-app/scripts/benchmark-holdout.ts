/** Stage 3: Japanese to Traditional Chinese accuracy on a frozen holdout.
 *
 * Text in, text out through the production local translator, so recognition
 * error cannot be mistaken for translation error. The automated checks are
 * necessary conditions written with the set, not a quality score; the candidate
 * output still needs bilingual review.
 */
import { app } from 'electron'
import { readFileSync, appendFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'
import { HunyuanMT2Translator } from '../src/engines/translator/HunyuanMT2Translator'
import { DEFAULT_JA_ZH_GLOSSARY } from '../src/engines/translator/default-glossary'

const env = process.env
for (const key of ['COMPARE_PROFILE', 'HOLDOUT_MANIFEST', 'COMPARE_REPORT']) {
  if (!env[key]) throw new Error('Missing ' + key)
}
app.setPath('userData', env.COMPARE_PROFILE!)

interface Row {
  id: string
  category: string
  ja: string
  zh: string
  mustContain?: string[]
  mustNotContain?: string[]
  intent: string
}

app.whenReady().then(async () => {
  const report = env.COMPARE_REPORT!
  const rows = JSON.parse(readFileSync(env.HOLDOUT_MANIFEST!, 'utf8')) as Row[]
  const emit = (row: unknown): void => { appendFileSync(report, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)) }
  writeFileSync(report, '')

  const translator = env.COMPARE_TRANSLATOR === 'hunyuan-mt-2'
    ? new HunyuanMT2Translator({ variant: '7B-Q4_K_M' })
    : new HunyuanMT15Translator()
  try {
    emit({
      type: 'metadata',
      model: env.COMPARE_TRANSLATOR || 'hunyuan-mt-15',
      label: env.COMPARE_LABEL || 'baseline',
      glossary: env.COMPARE_GLOSSARY === 'default' ? 'default-ja-zh' : 'none',
      manifestHash: createHash('sha256').update(readFileSync(env.HOLDOUT_MANIFEST!)).digest('hex'),
      items: rows.length,
      scope: 'production local translator, text only; no audio, no capture, no blind human score'
    })
    await translator.initialize()
    await translator.translate('準備ができました。', 'ja', 'zh')

    for (const row of rows) {
      const began = performance.now()
      let translated = '', error: string | undefined
      try {
        translated = await translator.translate(row.ja, 'ja', 'zh', {
          previousSegments: [],
          glossary: env.COMPARE_GLOSSARY === 'default' ? DEFAULT_JA_ZH_GLOSSARY : undefined
        })
      } catch (failure) {
        error = String(failure)
      }
      const missing = (row.mustContain || []).filter(term => !translated.includes(term))
      const forbidden = (row.mustNotContain || []).filter(term => translated.includes(term))
      emit({
        type: 'trial', id: row.id, category: row.category,
        ja: row.ja, reference: row.zh, translated, intent: row.intent,
        missingRequired: missing, presentForbidden: forbidden,
        checksPassed: !error && missing.length === 0 && forbidden.length === 0,
        ms: Math.round(performance.now() - began), error
      })
    }
    emit({ type: 'complete', items: rows.length })
  } catch (failure) {
    emit({ type: 'fatal', error: String(failure) })
    process.exitCode = 1
  } finally {
    await translator.dispose()
    app.quit()
  }
})
