/** Stage 4: Traditional Chinese to Japanese written drafts.
 *
 * Calls the production draft path the way `extension-companion.ts` does, so the
 * uncertainty repair in `draft-fidelity.ts` is included. Text only; the composer
 * UI and the browser are not covered. The automated checks are necessary
 * conditions written with the set, not a tone score.
 */
import { app } from 'electron'
import { readFileSync, appendFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'
import { HunyuanMT2Translator } from '../src/engines/translator/HunyuanMT2Translator'
import { translateWrittenDraft } from '../src/main/draft-fidelity'
import { DRAFT_ZH_JA_GLOSSARY, selectDraftTerminology } from '../src/main/draft-glossary'

const env = process.env
for (const key of ['COMPARE_PROFILE', 'REVIEW_MANIFEST', 'COMPARE_REPORT']) {
  if (!env[key]) throw new Error('Missing ' + key)
}
app.setPath('userData', env.COMPARE_PROFILE!)

interface Row {
  id: string
  surface?: string
  zh: string
  mustContain?: string[]
  mustNotContain?: string[]
  mustContainAny?: string[]
  mustNotContainAny?: string[]
  alsoMustContain?: string[]
  category?: string
  group?: string
  preserveEmoji?: string[]
  preserveLines?: number
  intent?: string
  tone?: string
}

app.whenReady().then(async () => {
  const report = env.COMPARE_REPORT!
  const rows = JSON.parse(readFileSync(env.REVIEW_MANIFEST!, 'utf8')) as Row[]
  const emit = (row: unknown): void => { appendFileSync(report, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)) }
  writeFileSync(report, '')

  const translator = env.COMPARE_TRANSLATOR === 'hunyuan-mt-2'
    ? new HunyuanMT2Translator({ variant: '7B-Q4_K_M' })
    : new HunyuanMT15Translator()
  try {
    emit({
      type: 'metadata', model: env.COMPARE_TRANSLATOR || 'hunyuan-mt-15', label: env.COMPARE_LABEL || 'baseline',
      glossary: env.COMPARE_GLOSSARY === 'none' ? 'none' : 'draft-zh-ja',
      manifestHash: createHash('sha256').update(readFileSync(env.REVIEW_MANIFEST!)).digest('hex'),
      items: rows.length,
      scope: 'production draft path including uncertainty repair; text only, no composer, no browser'
    })
    await translator.initialize()
    await translator.translate('準備好了。', 'zh', 'ja')

    for (const row of rows) {
      const began = performance.now()
      let draft = '', repaired = false, reviewWarning = false, error: string | undefined
      try {
        const result = await translateWrittenDraft(
          row.zh,
          (text, signal) => translator.translate(text, 'zh', 'ja', {
            signal, previousSegments: [],
            glossary: env.COMPARE_GLOSSARY === 'none' ? undefined
              : env.COMPARE_GLOSSARY === 'static' ? DRAFT_ZH_JA_GLOSSARY : selectDraftTerminology(row.zh)
          })
        )
        draft = result.text
        repaired = !!result.repaired
        reviewWarning = !!result.reviewWarning
      } catch (failure) {
        error = String(failure)
      }
      const anyMissing = row.mustContainAny && !row.mustContainAny.some(term => draft.includes(term))
        ? [`one of ${row.mustContainAny.join('|')}`] : []
      const missing = [...[...(row.mustContain || []), ...(row.alsoMustContain || [])].filter(term => !draft.includes(term)), ...anyMissing]
      const forbidden = [...(row.mustNotContain || []), ...(row.mustNotContainAny || [])].filter(term => draft.includes(term))
      const lostEmoji = (row.preserveEmoji || []).filter(glyph => !draft.includes(glyph))
      const lines = draft.split('\n').filter(line => line.trim()).length
      const lineMismatch = row.preserveLines !== undefined && lines !== row.preserveLines
      emit({
        type: 'trial', id: row.id, surface: row.surface, group: row.group ?? row.category, zh: row.zh, draft,
        intent: row.intent, tone: row.tone,
        repaired, reviewWarning,
        missingRequired: missing, presentForbidden: forbidden, lostEmoji,
        expectedLines: row.preserveLines ?? null, actualLines: lines, lineMismatch,
        checksPassed: !error && !missing.length && !forbidden.length && !lostEmoji.length && !lineMismatch,
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
