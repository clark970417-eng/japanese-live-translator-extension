/** Other work queued behind a cold large-model draft when captions interrupt it.
 *
 * Unlike `draft-model-concurrency.test.ts`, the translators and the worker pool
 * here are the production classes; only the model process is faked. A load
 * interrupted by `WorkerPool.terminate` therefore behaves as it does in the app,
 * including what happens to requests waiting behind it.
 */
import { it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { connect } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const fake = vi.hoisted(() => ({
  workers: [] as Array<{ model: string, killed: boolean, holdDispose: boolean, disposeRequested: boolean, releaseDispose: () => void }>,
  inits: [] as string[],
  translations: [] as Array<{ model: string, text: string }>,
  pipelineTranslator: null as null | import('../engines/translator/HunyuanMT15Translator').HunyuanMT15Translator,
  pipeline: null as null | { running: boolean, active: boolean },
  holdNextDispose: false
}))

vi.mock('electron', () => ({ utilityProcess: { fork: () => {
  const { EventEmitter: Emitter } = require('events') as typeof import('events')
  const worker = Object.assign(new Emitter(), {
    model: '', killed: false, holdDispose: fake.holdNextDispose, disposeRequested: false, releaseDispose: () => {}, pid: undefined,
    postMessage(message: Record<string, unknown>) {
      if (worker.killed) throw new Error('Worker is gone')
      const reply = (value: Record<string, unknown>): void => { setImmediate(() => { if (!worker.killed) worker.emit('message', value) }) }
      if (message.type === 'init') {
        worker.model = String(message.modelPath)
        fake.inits.push(worker.model)
        // A large model takes far longer to load than any test waits.
        if (!worker.model.includes('7B')) reply({ type: 'ready' })
      } else if (message.type === 'dispose') {
        worker.disposeRequested = true
        if (worker.holdDispose) worker.releaseDispose = () => reply({ type: 'disposed' })
        else reply({ type: 'disposed' })
      } else if (message.type === 'translate') {
        fake.translations.push({ model: worker.model, text: String(message.text) })
        reply({ type: 'result', id: message.id, text: `${worker.model.includes('7B') ? 'large' : 'small'}:${message.text}` })
      }
    },
    kill() { if (!worker.killed) { worker.killed = true; setImmediate(() => worker.emit('exit', 0)) } return true }
  })
  fake.holdNextDispose = false
  fake.workers.push(worker)
  return worker
} } }))

vi.mock('../engines/model-downloader', () => ({
  getGGUFDir: () => '/models',
  isGGUFDownloaded: () => false,
  downloadGGUF: async () => '',
  getLFM2Variants: () => ({ Q4_K_M: { filename: 'lfm2.gguf', url: '' } }),
  getHunyuanMT15Variants: () => ({ Q4_K_M: { filename: 'hy15-1.8B.gguf', url: '' } })
}))

vi.mock('./store', () => ({ store: { get: vi.fn((key: string) =>
  key === 'draftTranslationEngine' ? 'offline-hymt2' : key === 'translationEngine' ? 'offline-hymt15' : undefined) } }))

vi.mock('./ipc/pipeline-ipc', () => ({ startPipeline: vi.fn(async () => {
  const { HunyuanMT15Translator } = await import('../engines/translator/HunyuanMT15Translator')
  const translator = new HunyuanMT15Translator()
  await translator.initialize()
  fake.pipelineTranslator = translator
  fake.pipeline!.running = true; fake.pipeline!.active = true
  return { success: true }
}) }))

import { startExtensionCompanion } from './extension-companion'
import { workerPool } from './worker-pool'
import type { AppContext } from './app-context'

/** The fake pipeline answers at once, so a caption near this bound queued behind the large model. */
const CAPTION_BOUND_MS = 1500

beforeEach(async () => {
  fake.workers.length = 0; fake.inits.length = 0; fake.translations.length = 0
  fake.pipelineTranslator = null; fake.holdNextDispose = false
  // The pool is a process-wide singleton; start every test without a worker.
  workerPool.terminate('test reset')
  while (workerPool.references) await workerPool.release()
})

async function companion() {
  const directory = mkdtempSync(join(tmpdir(), 'jtl-cdq-'))
  const pipeline = Object.assign(new EventEmitter(), {
    active: false, running: false, canOverlapFinalTranslation: false, prepareFinalStreaming: vi.fn(),
    stop: vi.fn(async () => { pipeline.running = false; pipeline.active = false; await fake.pipelineTranslator?.dispose(); fake.pipelineTranslator = null }),
    processStreaming: vi.fn(async () => ({ sourceText: '声', translatedText: await fake.pipelineTranslator!.translate('声', 'ja', 'zh'), timestamp: 1 })),
    finalizeStreaming: vi.fn(async () => null),
    process: vi.fn(async () => null)
  })
  fake.pipeline = pipeline
  const server = await startExtensionCompanion({ pipeline } as unknown as AppContext, directory)
  const client = () => {
    const socket = connect(join(directory, 'desktop.sock'))
    const messages: Array<Record<string, unknown> & { at: number }> = []
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', data => {
      buffer += data
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) { messages.push({ ...JSON.parse(buffer.slice(0, newline)), at: Date.now() }); buffer = buffer.slice(newline + 1) }
    })
    const send = (message: object): void => { socket.write(JSON.stringify(message) + '\n') }
    const answered = (id: number) => messages.filter(m => m.id === id)
    const disconnect = (): Promise<void> => new Promise(resolve => { socket.once('close', () => resolve()); socket.destroy() })
    return { socket, messages, send, answered, disconnect }
  }
  const first = client()
  const clients = [first]
  const close = async (): Promise<void> => {
    for (const each of clients) each.socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
  const reconnect = () => { const next = client(); clients.push(next); return next }
  return { pipeline, messages: first.messages, send: first.send, answered: first.answered, disconnect: first.disconnect, reconnect, close }
}

const audio = Buffer.from(new Float32Array([.1, .2]).buffer).toString('base64')
const largeInits = (): number => fake.inits.filter(model => model.includes('7B')).length

it('serves captions first, then answers every text request queued behind the interrupted draft exactly once', async () => {
  const t = await companion()
  try {
    t.send({ id: 1, op: 'translate', direction: 'zh-ja', text: '謝謝你今天的直播' })
    await vi.waitFor(() => expect(largeInits()).toBe(1))
    // Page text and another draft arrive while the large model is loading.
    t.send({ id: 2, op: 'translate', direction: 'ja-zh', text: 'こんばんは' })
    t.send({ id: 3, op: 'translate', direction: 'zh-ja', text: '明天也會來' })
    t.send({ id: 4, op: 'translate', direction: 'ja-zh', text: 'ありがとう' })

    const began = Date.now()
    t.send({ id: 5, op: 'init' })
    t.send({ id: 6, op: 'decode', audio, segment: 'a:0', final: false })
    await vi.waitFor(() => expect(t.answered(6)).toHaveLength(1), { timeout: CAPTION_BOUND_MS + 500 })
    expect(t.answered(5)[0]).toMatchObject({ ok: true })
    expect(t.answered(6)[0]).toMatchObject({ ok: true, result: { translated: 'small:声' } })
    expect(t.answered(6)[0].at - began).toBeLessThan(CAPTION_BOUND_MS)

    // Every queued request is answered after captions, on the caption model.
    await vi.waitFor(() => expect([1, 2, 3, 4].every(id => t.answered(id).length === 1)).toBe(true), { timeout: 3000 })
    expect(t.answered(1)[0]).toMatchObject({ ok: true, result: { text: 'small:謝謝你今天的直播', fallbackModel: true } })
    expect(t.answered(2)[0]).toMatchObject({ ok: true, result: { text: 'small:こんばんは' } })
    expect(t.answered(3)[0]).toMatchObject({ ok: true, result: { text: 'small:明天也會來' } })
    expect(t.answered(4)[0]).toMatchObject({ ok: true, result: { text: 'small:ありがとう' } })
    for (const id of [1, 2, 3, 4]) expect(t.answered(id)[0].at).toBeGreaterThanOrEqual(t.answered(6)[0].at)

    // Nothing ran twice, nothing ran on the large model, and it was never reloaded.
    const texts = fake.translations.map(entry => entry.text)
    for (const text of ['謝謝你今天的直播', 'こんばんは', '明天也會來', 'ありがとう']) expect(texts.filter(value => value === text)).toHaveLength(1)
    expect(fake.translations.every(entry => !entry.model.includes('7B'))).toBe(true)
    expect(largeInits()).toBe(1)
    expect(fake.workers.filter(worker => worker.model.includes('7B')).every(worker => worker.killed)).toBe(true)
    expect(t.messages.some(m => String(m.error ?? '').includes('Live captions started'))).toBe(false)

    // Stop drains: it answers, the session ends, and nothing arrives afterwards.
    t.send({ id: 7, op: 'stop' })
    await vi.waitFor(() => expect(t.answered(7)).toHaveLength(1))
    expect(t.answered(7)[0]).toMatchObject({ ok: true, result: { stopped: true } })
    expect(t.pipeline.running).toBe(false)
    const count = t.messages.length
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(t.messages).toHaveLength(count)
    expect(t.messages.filter(m => typeof m.id === 'number')).toHaveLength(7)
  } finally { await t.close() }
})

it('interrupts a draft whose captions arrive while the previous text model is still being released', async () => {
  const t = await companion()
  try {
    // A page-text request leaves the small model loaded in the companion.
    t.send({ id: 1, op: 'translate', direction: 'ja-zh', text: 'こんにちは' })
    await vi.waitFor(() => expect(t.answered(1)).toHaveLength(1))
    // Its release waits for the worker to confirm disposal; hold that reply.
    fake.workers.at(-1)!.holdDispose = true
    t.send({ id: 2, op: 'translate', direction: 'zh-ja', text: '今天辛苦了' })
    await vi.waitFor(() => expect(fake.workers.at(-1)!.disposeRequested).toBe(true))

    const began = Date.now()
    t.send({ id: 3, op: 'init' })
    t.send({ id: 4, op: 'decode', audio, segment: 'b:0', final: false })
    fake.workers.at(-1)!.releaseDispose()
    await vi.waitFor(() => expect(t.answered(4)).toHaveLength(1), { timeout: CAPTION_BOUND_MS + 500 })
    expect(t.answered(4)[0]).toMatchObject({ ok: true, result: { translated: 'small:声' } })
    expect(t.answered(4)[0].at - began).toBeLessThan(CAPTION_BOUND_MS)
    await vi.waitFor(() => expect(t.answered(2)).toHaveLength(1), { timeout: 3000 })
    expect(t.answered(2)[0]).toMatchObject({ ok: true, result: { text: 'small:今天辛苦了', fallbackModel: true } })
    expect(fake.translations.filter(entry => entry.text === '今天辛苦了')).toHaveLength(1)
  } finally { await t.close() }
})

it('abandons a large load that begins after captions have already preempted the draft', async () => {
  const t = await companion()
  try {
    t.send({ id: 1, op: 'translate', direction: 'zh-ja', text: '謝謝' })
    // Captions arrive before the draft reaches the worker at all.
    t.send({ id: 2, op: 'init' })
    t.send({ id: 3, op: 'decode', audio, segment: 'c:0', final: false })
    await vi.waitFor(() => expect(t.answered(3)).toHaveLength(1), { timeout: CAPTION_BOUND_MS + 500 })
    await vi.waitFor(() => expect(t.answered(1)).toHaveLength(1), { timeout: 3000 })
    expect(t.answered(1)[0]).toMatchObject({ ok: true, result: { text: 'small:謝謝' } })
    expect(fake.translations.filter(entry => entry.text === '謝謝')).toHaveLength(1)
  } finally { await t.close() }
})

it('answers Stop at once when it interrupts a cold draft, and still answers the queued text', async () => {
  const t = await companion()
  try {
    t.send({ id: 1, op: 'translate', direction: 'zh-ja', text: '晚安' })
    await vi.waitFor(() => expect(largeInits()).toBe(1))
    t.send({ id: 2, op: 'translate', direction: 'ja-zh', text: 'おやすみ' })
    const began = Date.now()
    t.send({ id: 3, op: 'stop' })
    await vi.waitFor(() => expect(t.answered(3)).toHaveLength(1), { timeout: CAPTION_BOUND_MS + 500 })
    expect(t.answered(3)[0].at - began).toBeLessThan(CAPTION_BOUND_MS)
    await vi.waitFor(() => expect(t.answered(1).length + t.answered(2).length).toBe(2), { timeout: 3000 })
    expect(t.answered(1)[0]).toMatchObject({ ok: true, result: { text: 'small:晚安', fallbackModel: true } })
    expect(t.answered(2)[0]).toMatchObject({ ok: true, result: { text: 'small:おやすみ' } })
    expect(largeInits()).toBe(1)
  } finally { await t.close() }
})

it('lets a reconnecting client start captions without waiting for a cold draft from the closed connection', async () => {
  const t = await companion()
  try {
    t.send({ id: 1, op: 'translate', direction: 'zh-ja', text: '等一下' })
    t.send({ id: 2, op: 'translate', direction: 'ja-zh', text: 'ちょっと' })
    await vi.waitFor(() => expect(largeInits()).toBe(1))
    await t.disconnect()

    const next = t.reconnect()
    const began = Date.now()
    next.send({ id: 1, op: 'init' })
    next.send({ id: 2, op: 'decode', audio, segment: 'd:0', final: false })
    await vi.waitFor(() => expect(next.answered(2)).toHaveLength(1), { timeout: CAPTION_BOUND_MS + 500 })
    expect(next.answered(1)[0]).toMatchObject({ ok: true })
    expect(next.answered(2)[0]).toMatchObject({ ok: true, result: { translated: 'small:声' } })
    expect(next.answered(2)[0].at - began).toBeLessThan(CAPTION_BOUND_MS)
    // The closed connection's requests are not run for nobody, and the large
    // model is not loaded again.
    expect(fake.translations.map(entry => entry.text)).not.toContain('等一下')
    expect(fake.translations.map(entry => entry.text)).not.toContain('ちょっと')
    expect(largeInits()).toBe(1)
    expect(next.messages.filter(m => typeof m.id === 'number')).toHaveLength(2)
  } finally { await t.close() }
})
