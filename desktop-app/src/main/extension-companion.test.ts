import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { connect } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { startExtensionCompanion } from './extension-companion'
import type { AppContext } from './app-context'
import { startPipeline } from './ipc/pipeline-ipc'

vi.mock('./store', () => ({ store: { get: vi.fn() } }))
vi.mock('./ipc/pipeline-ipc', () => ({ startPipeline: vi.fn(async () => ({ success: true })) }))

vi.mock('../engines/translator/HunyuanMT15Translator', () => ({ HunyuanMT15Translator: class {
  async initialize() {} async dispose() {} async translate() { return 'こんにちは' }
} }))

it('emits Japanese before translation, rejects invalid audio, and continues after errors', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jtl-'))
  const pipeline = Object.assign(new EventEmitter(), {
    active: false, running: true, stop: vi.fn(async () => {}),
    processStreaming: vi.fn(async () => { pipeline.emit('interim-result', {sourceText:'こんにちは',translatedText:'',isInterim:true,timestamp:1}); return {sourceText:'こんにちは',translatedText:''} }),
    finalizeStreaming: vi.fn(async () => ({sourceText:'こんにちは',translatedText:'你好',timestamp:2})),
    process: vi.fn(async () => { pipeline.emit('source-result', '魚'); return { sourceText: '魚', translatedText: '魚' } })
  })
  const ctx = { pipeline } as unknown as AppContext
  const server = await startExtensionCompanion(ctx, directory)
  const socket = connect(join(directory, 'desktop.sock'))
  const messages: Array<Record<string, unknown>> = []
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', data => { buffer += data; let i: number; while ((i = buffer.indexOf('\n')) >= 0) { messages.push(JSON.parse(buffer.slice(0, i))); buffer = buffer.slice(i + 1) } })
  try {
    vi.mocked(startPipeline).mockResolvedValueOnce({ error: 'Model unavailable' })
    socket.write(JSON.stringify({id:-1,op:'init'})+'\n')
    await vi.waitFor(()=>expect(messages).toHaveLength(1))
    expect(messages[0]).toMatchObject({ok:false,error:'Model unavailable'})
    expect(ctx.extensionConnected).toBe(false)
    messages.length=0
    socket.write(JSON.stringify({id:0,op:'init'})+'\n')
    await vi.waitFor(()=>expect(messages).toHaveLength(1))
    messages.length=0
    socket.write(JSON.stringify({ id: 1, op: 'decode', audio: Buffer.from(new Float32Array([.1]).buffer).toString('base64') }) + '\n')
    await vi.waitFor(() => expect(messages).toHaveLength(2))
    expect(messages[0]).toMatchObject({ id: 1, event: 'source', text: '魚' })
    expect(messages[1]).toMatchObject({ id: 1, ok: true, result: { translated: '魚' } })
    socket.write(JSON.stringify({ id: 2, op: 'decode', audio: Buffer.from(new Float32Array([NaN]).buffer).toString('base64') }) + '\n')
    socket.write(JSON.stringify({ id: 3, op: 'translate', direction: 'zh-ja', text: '你好' }) + '\n')
    await vi.waitFor(() => expect(messages).toHaveLength(4))
    expect(messages[2]).toMatchObject({ id: 2, ok: false })
    expect(messages[3]).toMatchObject({ id: 3, ok: true, result: { text: 'こんにちは' } })
    expect(pipeline.process).toHaveBeenCalledTimes(1)
    const audio=Buffer.from(new Float32Array([.1]).buffer).toString('base64')
    socket.write(JSON.stringify({id:4,op:'decode',segment:'first',final:false,audio})+'\n')
    await vi.waitFor(()=>expect(messages).toHaveLength(6))
    expect(messages[4]).toMatchObject({event:'caption',segment:'first',result:{text:'こんにちは'}})
    socket.write(JSON.stringify({id:5,op:'decode',segment:'first',final:true,audio})+'\n')
    await vi.waitFor(()=>expect(messages).toHaveLength(7))
    expect(pipeline.processStreaming).toHaveBeenCalledTimes(1)
    expect(pipeline.finalizeStreaming).toHaveBeenCalledTimes(1)
    pipeline.emit('ger-corrected',{sourceText:'こんにちは！',translatedText:'你好！',timestamp:2})
    await vi.waitFor(()=>expect(messages).toHaveLength(8))
    expect(messages[7]).toMatchObject({segment:'first',result:{correction:true}})
  } finally {
    socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})
