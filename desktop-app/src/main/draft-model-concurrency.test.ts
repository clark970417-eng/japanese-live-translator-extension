/** A cold large-model draft must not hold live captions hostage.
 *
 * Sequence under test: a written draft starts while no caption session exists,
 * so it chooses the large draft model and begins loading it; then the browser
 * sends caption `init` and `decode`. Captions must complete while that load is
 * still in progress.
 */
import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { connect } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { startExtensionCompanion } from './extension-companion'
import type { AppContext } from './app-context'

const control = vi.hoisted(() => ({
  largeLoadStarted: false,
  largeLoadFinished: false,
  releaseLargeLoad: null as null | (() => void),
  rejectLargeLoad: null as null | ((error: Error) => void),
  interrupted: '' as string,
  largeTranslate: null as null | ((text: string, signal?: AbortSignal) => Promise<string>),
  pipeline: null as null | { running: boolean }
}))

vi.mock('./store', () => ({ store: { get: vi.fn((key: string) =>
  key === 'draftTranslationEngine' ? 'offline-hymt2' : key === 'translationEngine' ? 'offline-hymt15' : undefined) } }))

vi.mock('./ipc/pipeline-ipc', () => ({ startPipeline: vi.fn(async () => {
  if (control.pipeline) control.pipeline.running = true
  return { success: true }
}) }))

vi.mock('../engines/translator/HunyuanMT15Translator', () => ({ HunyuanMT15Translator: class {
  async initialize() {} async dispose() {}
  async translate() { return 'こんにちは' }
} }))

vi.mock('../engines/translator/HunyuanMT2Translator', () => ({ HunyuanMT2Translator: class {
  async initialize() {
    control.largeLoadStarted = true
    // Stands in for loading several gigabytes of weights. Like the worker pool,
    // an interrupted load rejects instead of finishing.
    await new Promise<void>((resolve, reject) => { control.releaseLargeLoad = resolve; control.rejectLargeLoad = reject })
    control.largeLoadFinished = true
  }
  interrupt(reason: string) { control.interrupted = reason; control.rejectLargeLoad?.(new Error(reason)) }
  async dispose() {}
  async translate(text: string, _from: string, _to: string, context?: { signal?: AbortSignal }) {
    return control.largeTranslate ? control.largeTranslate(text, context?.signal) : 'ありがとうございます'
  }
} }))

/** How long captions may take here. The fake pipeline answers immediately, so
 * anything near this bound means captions queued behind the large model. */
const CAPTION_BOUND_MS = 1500

it('completes caption init and decode while a cold large-model draft is still loading', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jtl-cold-draft-'))
  const pipeline = Object.assign(new EventEmitter(), {
    active: false, running: false, stop: vi.fn(async () => {}),
    canOverlapFinalTranslation: false, prepareFinalStreaming: vi.fn(),
    processStreaming: vi.fn(async () => ({ sourceText: '声', translatedText: '聲音' })),
    finalizeStreaming: vi.fn(async () => ({ sourceText: '声', translatedText: '聲音', timestamp: 1 })),
    process: vi.fn(async () => ({ sourceText: '声', translatedText: '聲音' }))
  })
  control.pipeline = pipeline
  const server = await startExtensionCompanion({ pipeline } as unknown as AppContext, directory)
  const socket = connect(join(directory, 'desktop.sock'))
  const messages: Array<Record<string, unknown> & { at: number }> = []
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', data => {
    buffer += data
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      messages.push({ ...JSON.parse(buffer.slice(0, newline)), at: Date.now() })
      buffer = buffer.slice(newline + 1)
    }
  })
  const send = (message: object): void => { socket.write(JSON.stringify(message) + '\n') }
  const audio = Buffer.from(new Float32Array([.1, .2]).buffer).toString('base64')
  try {
    send({ id: 1, op: 'translate', direction: 'zh-ja', text: '謝謝你今天的直播' })
    await vi.waitFor(() => expect(control.largeLoadStarted).toBe(true))

    const began = Date.now()
    send({ id: 2, op: 'init' })
    send({ id: 3, op: 'decode', audio, segment: 'a:0', final: false })

    await vi.waitFor(() => expect(messages.some(m => m.id === 3)).toBe(true), { timeout: CAPTION_BOUND_MS + 500 })
    const init = messages.find(m => m.id === 2)!
    const decode = messages.find(m => m.id === 3)!
    expect(init.ok).toBe(true)
    expect(decode.ok).toBe(true)
    expect(decode.at - began).toBeLessThan(CAPTION_BOUND_MS)
    // The whole point: captions were served before the large model finished.
    expect(control.largeLoadFinished).toBe(false)

    // The large load was abandoned rather than awaited...
    expect(control.interrupted).toContain('Live captions')
    // ...and the draft is still answered, on the caption model, after captions.
    await vi.waitFor(() => expect(messages.some(m => m.id === 1)).toBe(true))
    const draft = messages.find(m => m.id === 1)!
    expect(draft.ok).toBe(true)
    expect(draft.result).toMatchObject({ text: 'こんにちは', fallbackModel: true })
    expect(draft.at).toBeGreaterThanOrEqual(decode.at)
  } finally {
    control.releaseLargeLoad?.()
    socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})

it('keeps a large-model first draft that finished before captions arrived, without a fallback', async () => {
  control.largeLoadStarted = false; control.largeLoadFinished = false; control.interrupted = ''
  const directory = mkdtempSync(join(tmpdir(), 'jtl-late-preempt-'))
  const pipeline = Object.assign(new EventEmitter(), {
    active: false, running: false, stop: vi.fn(async () => {}),
    canOverlapFinalTranslation: false, prepareFinalStreaming: vi.fn(),
    processStreaming: vi.fn(async () => ({ sourceText: '声', translatedText: '聲音' })),
    finalizeStreaming: vi.fn(async () => ({ sourceText: '声', translatedText: '聲音', timestamp: 1 })),
    process: vi.fn(async () => ({ sourceText: '声', translatedText: '聲音' }))
  })
  control.pipeline = pipeline
  let repairStarted = false
  // First pass loses the request; the repair of the request clause then hangs
  // until captions interrupt it, like a generation in progress.
  control.largeTranslate = async (text, signal) => {
    if (text.includes('，')) return '今日はお疲れさまでした。夜更かしはしません。'
    repairStarted = true
    return new Promise<string>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
  }
  const server = await startExtensionCompanion({ pipeline } as unknown as AppContext, directory)
  const socket = connect(join(directory, 'desktop.sock'))
  const messages: Array<Record<string, unknown>> = []
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', data => {
    buffer += data
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) { messages.push(JSON.parse(buffer.slice(0, newline))); buffer = buffer.slice(newline + 1) }
  })
  const send = (message: object): void => { socket.write(JSON.stringify(message) + '\n') }
  try {
    send({ id: 1, op: 'translate', direction: 'zh-ja', text: '今天辛苦了，不要熬夜太晚喔' })
    await vi.waitFor(() => expect(control.largeLoadStarted).toBe(true))
    control.releaseLargeLoad?.()
    await vi.waitFor(() => expect(repairStarted).toBe(true))
    send({ id: 2, op: 'init' })
    await vi.waitFor(() => expect(messages.some(m => m.id === 1) && messages.some(m => m.id === 2)).toBe(true))
    const draft = messages.find(m => m.id === 1)!
    expect(draft.ok).toBe(true)
    // The large model's own first draft is returned for review, not replaced.
    expect(draft.result).toMatchObject({ text: '今日はお疲れさまでした。夜更かしはしません。', reviewWarning: expect.any(String) })
    expect((draft.result as Record<string, unknown>).fallbackModel).toBeUndefined()
    expect(messages.find(m => m.id === 2)!.ok).toBe(true)
  } finally {
    control.largeTranslate = null
    socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})
