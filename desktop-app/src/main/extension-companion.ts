/** Private local adapter for the existing browser UI; uses the production pipeline. */
import { createServer, type Server } from 'net'
import { mkdirSync, chmodSync, existsSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { AppContext } from './app-context'
import { HunyuanMT15Translator } from '../engines/translator/HunyuanMT15Translator'

export async function startExtensionCompanion(ctx: AppContext, directory?: string): Promise<Server> {
  const dir = directory || join(homedir(), 'Library/Application Support/JapaneseLiveCaption')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  const path = join(dir, 'desktop.sock')
  if (existsSync(path)) unlinkSync(path)
  let owned = false
  const server = createServer(socket => {
    if (owned) { socket.end(); return }
    owned = true
    ctx.extensionConnected = true
    // The extension owns the visible overlay during a browser session.
    ctx.subtitleWindow?.hide()
    socket.setEncoding('utf8')
    let buffer = '', pending = 0, closed = false
    let queue = Promise.resolve()
    const translator = new HunyuanMT15Translator()
    const send = (value: unknown): void => { if (!closed) socket.write(JSON.stringify(value) + '\n') }
    socket.on('data', chunk => {
      buffer += chunk.toString()
      if (buffer.length > 2_000_000) { socket.destroy(); return }
      for (;;) {
        const newline = buffer.indexOf('\n'); if (newline < 0) break
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        if (++pending > 16) { socket.destroy(); break }
        queue = queue.then(async () => {
          if (closed) return
          let m: { id?: number; op?: string; audio?: string; text?: string; direction?: string } = {}
          try {
            m = JSON.parse(line)
            const pipeline = ctx.pipeline
            if (!pipeline) throw new Error('Desktop pipeline not ready')
            let result: unknown
            if (m.op === 'init') {
              pipeline.setLanguageConfig('ja', 'zh')
              if (!pipeline.active || pipeline.currentConfig?.translatorEngineId !== 'hunyuan-mt-15') {
                if (pipeline.active) await pipeline.stop()
                await pipeline.switchEngine({ mode: 'cascade', sttEngineId: 'mlx-whisper', translatorEngineId: 'hunyuan-mt-15' })
                pipeline.start()
              }
              await translator.initialize()
              result = { model: 'LiveTranslate · MLX Whisper + HY-MT', dtype: 'native Q4_K_M' }
            } else if (m.op === 'decode') {
              if (!pipeline.running || typeof m.audio !== 'string') throw new Error('Start desktop mode first')
              const bytes = Buffer.from(m.audio, 'base64')
              if (!bytes.length || bytes.length % 4 || bytes.length > 960000) throw new Error('Invalid audio size')
              const audio = new Float32Array(bytes.length / 4)
              for (let i = 0; i < audio.length; i++) audio[i] = bytes.readFloatLE(i * 4)
              if (!audio.every(Number.isFinite)) throw new Error('Invalid audio samples')
              let original = ''
              const source = (text: string): void => { original = text; send({ id: m.id, event: 'source', text }) }
              pipeline.on('source-result', source)
              try {
                const translated = await pipeline.process(audio, 16000)
                result = { text: translated?.sourceText || original, translated: translated?.translatedText || '' }
              } finally { pipeline.off('source-result', source) }
            } else if (m.op === 'translate') {
              if (typeof m.text !== 'string' || !m.text.trim() || m.text.length > 3000) throw new Error('Invalid text')
              if (!['ja-zh', 'zh-ja', 'ja-en'].includes(m.direction || 'ja-zh')) throw new Error('Invalid language')
              const from = m.direction === 'zh-ja' ? 'zh' : 'ja'
              const to = m.direction === 'zh-ja' ? 'ja' : m.direction === 'ja-en' ? 'en' : 'zh'
              result = { text: await translator.translate(m.text, from, to) }
            } else throw new Error('Unsupported operation')
            send({ id: m.id, ok: true, result })
          } catch (error) { send({ id: m.id, ok: false, error: error instanceof Error ? error.message : String(error) }) }
          finally { pending-- }
        }).catch(() => { socket.destroy() })
      }
    })
    socket.on('error', () => socket.destroy())
    socket.on('close', () => {
      closed = true
      void queue.finally(async () => { try { await ctx.pipeline?.stop(); await translator.dispose() } finally { owned = false; ctx.extensionConnected = false } })
    })
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(path, () => { chmodSync(path, 0o600); resolve() }) })
  return server
}
