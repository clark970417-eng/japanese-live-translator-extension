import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { connect } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { startExtensionCompanion } from './extension-companion'
import type { AppContext } from './app-context'
import { store } from './store'
import { startPipeline } from './ipc/pipeline-ipc'

vi.mock('./store', () => ({ store: { get: vi.fn() } }))
vi.mock('./ipc/pipeline-ipc', () => ({ startPipeline: vi.fn(async () => ({ success: true })) }))
const textInference = vi.hoisted(() => vi.fn(async () => 'こんにちは'))

vi.mock('../engines/translator/HunyuanMT15Translator', () => ({ HunyuanMT15Translator: class {
  async initialize() {} async dispose() {} async translate() { return textInference() }
} }))

vi.mock('../engines/translator/HunyuanMT2Translator', () => ({ HunyuanMT2Translator: class {
  async initialize() {} async dispose() {} async translate() { return '新しいモデル' }
} }))

it('emits Japanese before translation, rejects invalid audio, and continues after errors', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jtl-'))
  const pipeline = Object.assign(new EventEmitter(), {
    active: false, running: true, stop: vi.fn(async () => {}),
    canOverlapFinalTranslation: false, prepareFinalStreaming: vi.fn(),
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
    expect(pipeline.prepareFinalStreaming).not.toHaveBeenCalled()
    pipeline.emit('ger-corrected',{sourceText:'こんにちは！',translatedText:'你好！',timestamp:2})
    await vi.waitFor(()=>expect(messages).toHaveLength(8))
    expect(messages[7]).toMatchObject({segment:'first',result:{correction:true}})
    pipeline.emit('draft-stt-result',{sourceText:'暫定',translatedText:'',isInterim:true,timestamp:3})
    await vi.waitFor(()=>expect(messages).toHaveLength(9))
    expect(messages[8]).toMatchObject({event:'caption',segment:'first',result:{text:'暫定',translated:'',interim:true}})
    vi.mocked(store.get).mockReturnValue('offline-hymt2')
    socket.write(JSON.stringify({id:6,op:'translate',direction:'zh-ja',text:'你好'})+'\n')
    await vi.waitFor(()=>expect(messages).toHaveLength(10))
    expect(messages[9]).toMatchObject({id:6,ok:true,result:{text:'新しいモデル'}})
    vi.mocked(store.get).mockReset()
  } finally {
    socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})

it('rejects excess page translations without disconnecting audio and gives queued audio priority', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jtl-queue-'))
  const order: string[] = []
  const pipeline = Object.assign(new EventEmitter(), {
    active: false, running: true, stop: vi.fn(async () => {}),
    process: vi.fn(async () => { order.push('audio'); return { sourceText: '声', translatedText: '聲音' } })
  })
  const server = await startExtensionCompanion({pipeline} as unknown as AppContext, directory)
  const socket = connect(join(directory, 'desktop.sock'))
  const messages: Array<Record<string, unknown>> = []
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', data => {
    buffer += data
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      messages.push(JSON.parse(buffer.slice(0, newline))); buffer = buffer.slice(newline + 1)
    }
  })
  const send = (message: object): void => { socket.write(JSON.stringify(message) + '\n') }
  let release!: (value: string) => void
  try {
    send({id:0,op:'init'})
    await vi.waitFor(() => expect(messages.some(m => m.id === 0 && m.ok)).toBe(true))
    textInference.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    textInference.mockImplementation(async () => { order.push('text'); return 'こんにちは' })
    send({id:1,op:'translate',text:'最初'})
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    for (let id = 2; id < 20; id++) send({id,op:'translate',text:'文字' + id})
    send({id:30,op:'decode',audio:Buffer.from(new Float32Array([.1]).buffer).toString('base64')})
    await vi.waitFor(() => expect(messages.some(m => String(m.error).includes('queue is full'))).toBe(true))
    expect(socket.destroyed).toBe(false)
    release('最初')
    await vi.waitFor(() => expect(messages.some(m => m.id === 30 && m.ok)).toBe(true))
    expect(order[0]).toBe('audio')
    await vi.waitFor(() => expect(messages.filter(m => m.id !== 0)).toHaveLength(20))
    send({id:31,op:'translate',text:'再試行'})
    await vi.waitFor(() => expect(messages.some(m => m.id === 31 && m.ok)).toBe(true))
  } finally {
    release?.('cleanup')
    socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
    textInference.mockReset().mockResolvedValue('こんにちは')
    rmSync(directory, { recursive: true, force: true })
  }
})

it('acknowledges recognized speech before translation, routes late Chinese to its own segment and drains on stop', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jtl-overlap-'))
  const releases: Array<(r: unknown) => void> = []
  const pipeline = Object.assign(new EventEmitter(), {
    active: false, running: true, stop: vi.fn(async () => {}),
    canOverlapFinalTranslation: true,
    prepareFinalStreaming: vi.fn(async () => {
      const sourceText = '文' + (releases.length + 1)
      pipeline.emit('source-result', sourceText)
      return { sourceText, completion: new Promise(resolve => releases.push(resolve)) }
    })
  })
  const server = await startExtensionCompanion({pipeline} as unknown as AppContext, directory)
  const socket = connect(join(directory, 'desktop.sock'))
  const messages: any[] = []
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', data => { buffer += data; let n: number; while ((n = buffer.indexOf('\n')) >= 0) { messages.push(JSON.parse(buffer.slice(0,n))); buffer = buffer.slice(n+1) } })
  const send = (m: object) => socket.write(JSON.stringify(m) + '\n')
  try {
    send({id:0,op:'init'})
    await vi.waitFor(() => expect(messages.some(m => m.id === 0 && m.ok)).toBe(true))
    const audio = Buffer.from(new Float32Array([.1]).buffer).toString('base64')
    send({id:1,op:'decode',segment:'first',audio,final:true})
    await vi.waitFor(() => expect(messages.some(m => m.id === 1 && m.result?.pending)).toBe(true))
    send({id:2,op:'decode',segment:'second',audio,final:true})
    await vi.waitFor(() => expect(messages.some(m => m.id === 2 && m.result?.pending)).toBe(true))
    send({id:3,op:'stop'})
    await new Promise(resolve => setTimeout(resolve,20))
    expect(pipeline.stop).not.toHaveBeenCalled()
    releases[0]({sourceText:'文1',translatedText:'第一句',timestamp:1})
    releases[1]({sourceText:'文2',translatedText:'第二句',timestamp:2})
    await vi.waitFor(() => expect(messages.some(m => m.id === 3 && m.ok)).toBe(true))
    expect(messages.filter(m => m.event === 'caption').map(m => [m.segment,m.result.translated])).toEqual([
      ['first','第一句'],['second','第二句']
    ])
    expect(pipeline.stop).toHaveBeenCalledOnce()
  } finally {
    for (const release of releases) release(null)
    socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory,{recursive:true,force:true})
  }
})
