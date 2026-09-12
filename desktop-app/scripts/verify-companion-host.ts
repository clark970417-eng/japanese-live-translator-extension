/** Host the real extension companion for socket-level verification.
 *
 * Starts `startExtensionCompanion` with the production pipeline, the production
 * engines and the real socket protocol, in a contained profile and a contained
 * socket directory. It deliberately skips `index.ts`, so no onboarding
 * downloader, window, shortcut or updater runs. Chrome/Opera and tab capture
 * are still not covered.
 */
import { app } from 'electron'
import { TranslationPipeline } from '../src/pipeline/TranslationPipeline'
import { MlxWhisperEngine } from '../src/engines/stt/MlxWhisperEngine'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'

const env = process.env
for (const key of ['COMPARE_PROFILE', 'COMPANION_DIR']) if (!env[key]) throw new Error('Missing ' + key)
app.setPath('userData', env.COMPARE_PROFILE!)

app.whenReady().then(async () => {
  const { store } = await import('../src/main/store')
  const { startExtensionCompanion } = await import('../src/main/extension-companion')
  // Pin the production local path so no engine selection reaches a cloud
  // provider or a model this profile does not have.
  store.set('translationEngine', 'offline-hymt15')
  store.set('sttEngine', 'mlx-whisper')
  store.set('sourceLanguage', 'ja')
  store.set('targetLanguage', 'zh')

  const pipeline = new TranslationPipeline()
  pipeline.registerSTT('mlx-whisper', () => new MlxWhisperEngine({ language: 'ja' }))
  pipeline.registerTranslator('hunyuan-mt-15', () => new HunyuanMT15Translator())

  const context = {
    pipeline, mainWindow: null, subtitleWindow: null, logger: null,
    extensionConnected: false
  }
  await startExtensionCompanion(context as never, env.COMPANION_DIR)
  console.log(JSON.stringify({ type: 'companion-ready', socket: env.COMPANION_DIR }))
})
