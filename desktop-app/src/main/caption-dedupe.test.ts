/** Repeated caption events: suppress what changes nothing, keep what is new. */
import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { connect } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { companionEndpoint, startExtensionCompanion } from './extension-companion'
import type { AppContext } from './app-context'

vi.mock('./store', () => ({ store: { get: vi.fn() } }))
vi.mock('./ipc/pipeline-ipc', () => ({ startPipeline: vi.fn(async () => ({ success: true })) }))
vi.mock('../engines/translator/HunyuanMT15Translator', () => ({ HunyuanMT15Translator: class {
  async initialize() {} async dispose() {} async translate() { return '' }
} }))
vi.mock('../engines/translator/HunyuanMT2Translator', () => ({ HunyuanMT2Translator: class {
  async initialize() {} async dispose() {} async translate() { return '' }
} }))

type Emit = { sourceText: string, translatedText: string, isInterim?: boolean, timestamp: number }

/** A companion whose decode replays a script of pipeline emissions for the segment. */
async function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'jtl-dedupe-'))
  let script: Emit[] = []
  const pipeline = Object.assign(new EventEmitter(), {
    active: false, running: true, stop: vi.fn(async () => {}),
    canOverlapFinalTranslation: false, prepareFinalStreaming: vi.fn(),
    processStreaming: vi.fn(async () => {
      for (const result of script) pipeline.emit('interim-result', result)
      return script.at(-1)
    }),
    finalizeStreaming: vi.fn(async () => null),
    process: vi.fn(async () => null)
  })
  const server = await startExtensionCompanion({ pipeline } as unknown as AppContext, directory)
  const socket = connect(companionEndpoint(directory))
  const messages: Array<Record<string, unknown>> = []
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', data => {
    buffer += data
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) { messages.push(JSON.parse(buffer.slice(0, newline))); buffer = buffer.slice(newline + 1) }
  })
  let id = 0
  const request = async (message: Record<string, unknown>): Promise<void> => {
    const current = ++id
    socket.write(JSON.stringify({ id: current, ...message }) + '\n')
    await vi.waitFor(() => expect(messages.some(m => m.id === current)).toBe(true))
  }
  const audio = Buffer.from(new Float32Array([.1, .2]).buffer).toString('base64')
  await request({ op: 'init' })
  return {
    pipeline, messages,
    decode: async (segment: string, emissions: Emit[]) => { script = emissions; await request({ op: 'decode', audio, segment, final: false }) },
    captions: (segment?: string) => messages.filter(m => m.event === 'caption' && (!segment || m.segment === segment)),
    close: async () => { socket.destroy(); await new Promise<void>(r => server.close(() => r())); rmSync(directory, { recursive: true, force: true }) }
  }
}

const interim = (sourceText: string, translatedText: string, timestamp: number): Emit => ({ sourceText, translatedText, isInterim: true, timestamp })

it('sends a result repeated for the same segment once', async () => {
  const t = await harness()
  try {
    await t.decode('a:0', [interim('夏の暑さは', '夏天的炎熱', 10), interim('夏の暑さは', '夏天的炎熱', 10), interim('夏の暑さは', '夏天的炎熱', 11)])
    expect(t.captions('a:0')).toHaveLength(1)
  } finally { await t.close() }
})

it('sends the same words again in a different segment', async () => {
  const t = await harness()
  try {
    await t.decode('u5:0', [interim('ごめん、ちょっと。', '對不起，請稍等一下。', 20)])
    await t.decode('u6:0', [interim('ごめん、ちょっと。', '對不起，請稍等一下。', 21)])
    expect(t.captions('u5:0')).toHaveLength(1)
    expect(t.captions('u6:0')).toHaveLength(1)
  } finally { await t.close() }
})

it('sends every change, including a return to earlier content', async () => {
  const t = await harness()
  try {
    await t.decode('b:0', [interim('明日の', '', 30), interim('明日の', '明天的', 31), interim('明日の', '', 32)])
    expect(t.captions('b:0').map(m => (m.result as { translated: string }).translated)).toEqual(['', '明天的', ''])
  } finally { await t.close() }
})

it('sends the final caption even when its words match the last interim', async () => {
  const t = await harness()
  try {
    await t.decode('c:0', [interim('はい。', '好的。', 40), { sourceText: 'はい。', translatedText: '好的。', isInterim: false, timestamp: 41 }])
    expect(t.captions('c:0').map(m => (m.result as { final: boolean }).final)).toEqual([false, true])
  } finally { await t.close() }
})

it('still routes a correction that names the timestamp of a suppressed repeat', async () => {
  const t = await harness()
  try {
    await t.decode('d:0', [interim('さくらさん', '櫻小姐', 50), interim('さくらさん', '櫻小姐', 51)])
    expect(t.captions('d:0')).toHaveLength(1)
    t.pipeline.emit('ger-corrected', { sourceText: 'さくらさん', translatedText: 'さくら', timestamp: 51 })
    await vi.waitFor(() => expect(t.captions('d:0').some(m => (m.result as { correction?: boolean }).correction)).toBe(true))
  } finally { await t.close() }
})
