/** Speech evidence on decode: an outro transcript is kept only when the audio
 * it came from carried speech, and evidence never outlives its segment.
 *
 * The companion and its socket protocol are real. The pipeline is a stand-in
 * whose recognizer always hears the stock outro and applies the production
 * rule, `isUnspokenOutro`, to whatever evidence the companion hands it. Every
 * recognition call is recorded with a marker identifying its audio.
 */
import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { connect } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { startExtensionCompanion } from './extension-companion'
import { isUnspokenOutro } from '../engines/stt/transcript-guard'
import type { SpeechEvidence } from '../engines/types'
import type { AppContext } from './app-context'

vi.mock('./store', () => ({ store: { get: vi.fn() } }))
vi.mock('./ipc/pipeline-ipc', () => ({ startPipeline: vi.fn(async () => ({ success: true })) }))
vi.mock('../engines/translator/HunyuanMT15Translator', () => ({ HunyuanMT15Translator: class {
  async initialize() {} async dispose() {} async translate() { return '' }
} }))
vi.mock('../engines/translator/HunyuanMT2Translator', () => ({ HunyuanMT2Translator: class {
  async initialize() {} async dispose() {} async translate() { return '' }
} }))

const OUTRO = 'ご視聴ありがとうございました'
type Call = { op: 'interim' | 'final', marker: number, evidence: SpeechEvidence | undefined }

async function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'jtl-outro-'))
  const calls: Call[] = []
  let clock = 0
  const recognize = (op: Call['op'], audio: Float32Array, evidence?: SpeechEvidence) => {
    calls.push({ op, marker: audio[0], evidence })
    return isUnspokenOutro(OUTRO, evidence) ? null : { sourceText: OUTRO, translatedText: '感謝收看', timestamp: ++clock }
  }
  const pipeline = Object.assign(new EventEmitter(), {
    active: false, running: true, canOverlapFinalTranslation: false, prepareFinalStreaming: vi.fn(),
    stop: vi.fn(async () => {}),
    processStreaming: vi.fn(async (audio: Float32Array, _rate: number, evidence?: SpeechEvidence) => {
      const result = recognize('interim', audio, evidence)
      if (result) pipeline.emit('interim-result', { ...result, isInterim: true })
      return result && { ...result, isInterim: true }
    }),
    finalizeStreaming: vi.fn(async (audio: Float32Array, _rate: number, evidence?: SpeechEvidence) => {
      const result = recognize('final', audio, evidence)
      return result && { ...result, isInterim: false }
    }),
    process: vi.fn(async () => null)
  })
  const server = await startExtensionCompanion({ pipeline } as unknown as AppContext, directory)
  const sockets: Array<ReturnType<typeof connect>> = []
  const client = () => {
    const socket = connect(join(directory, 'desktop.sock'))
    sockets.push(socket)
    const messages: Array<Record<string, unknown>> = []
    let buffer = '', id = 0
    socket.setEncoding('utf8')
    socket.on('data', data => {
      buffer += data
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) { messages.push(JSON.parse(buffer.slice(0, newline))); buffer = buffer.slice(newline + 1) }
    })
    const request = async (message: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const current = ++id
      socket.write(JSON.stringify({ id: current, ...message }) + '\n')
      await vi.waitFor(() => expect(messages.some(m => m.id === current)).toBe(true))
      return messages.find(m => m.id === current)!
    }
    const audio = (marker: number, seconds = 2, level = .2): string => {
      const samples = new Float32Array(Math.round(seconds * 16000)).fill(level)
      samples[0] = marker
      return Buffer.from(samples.buffer).toString('base64')
    }
    const decode = (segment: string, marker: number, final: boolean, fields: Record<string, unknown> = {}, seconds?: number, level?: number) =>
      request({ op: 'decode', audio: audio(marker, seconds, level), segment, final, ...fields })
    const captions = (segment: string) => messages.filter(m => m.event === 'caption' && m.segment === segment)
      .map(m => (m.result as { text: string, final: boolean }))
    const disconnect = (): Promise<void> => new Promise(resolve => { socket.once('close', () => resolve()); socket.destroy() })
    return { request, decode, captions, disconnect }
  }
  const close = async (): Promise<void> => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
  return { calls, pipeline, client, close }
}

const kept = (reply: Record<string, unknown>): boolean => (reply.result as { text: string }).text === OUTRO

it.each([
  ['genuine speech', { speechSeconds: 1.98 }, .2, true],
  ['quiet speech', { speechSeconds: 1.98 }, .001, true],
  ['speech over music', { speechSeconds: 2.0 }, .3, true],
  ['silence', { speechSeconds: 0 }, 0, false],
  ['music-only audio', { speechSeconds: 0.13 }, .3, false],
  ['missing metadata, as from an older browser', {}, .2, false]
])('%s', async (_name, fields, level, expected) => {
  const t = await harness()
  try {
    const c = t.client()
    await c.request({ op: 'init' })
    const reply = await c.decode('s:1', 11, true, fields, 2, level)
    expect(reply.ok).toBe(true)
    expect(kept(reply)).toBe(expected)
    expect(t.calls).toEqual([{ op: 'final', marker: 11, evidence: 'speechSeconds' in fields ? fields : undefined }])
  } finally { await t.close() }
})

it('treats evidence that cannot describe the audio as missing, and still decodes', async () => {
  const t = await harness()
  try {
    const c = t.client()
    await c.request({ op: 'init' })
    for (const [index, speechSeconds] of ['1.5', -1, 99, null, { seconds: 2 }, [2]].entries()) {
      const reply = await c.decode(`bad:${index}`, 20 + index, true, { speechSeconds }, 2)
      expect(reply.ok).toBe(true)
      expect(kept(reply)).toBe(false)
    }
    expect(t.calls.every(call => call.evidence === undefined)).toBe(true)
  } finally { await t.close() }
})

it('finalizes a segment with its own evidence, not the next segment\'s', async () => {
  const t = await harness()
  try {
    const c = t.client()
    await c.request({ op: 'init' })
    // Spoken thanks, then music: the spoken segment keeps its caption when the
    // music segment's arrival finalizes it.
    await c.decode('a:1', 1, false, { speechSeconds: 1.9 })
    await c.decode('a:2', 2, false, { speechSeconds: 0 })
    // Music, then spoken thanks: the music segment is finalized without speech.
    await c.decode('a:3', 3, false, { speechSeconds: 0.1 })
    await c.decode('a:4', 4, false, { speechSeconds: 2 })
    expect(t.calls).toEqual([
      { op: 'interim', marker: 1, evidence: { speechSeconds: 1.9 } },
      { op: 'final', marker: 1, evidence: { speechSeconds: 1.9 } },
      { op: 'interim', marker: 2, evidence: { speechSeconds: 0 } },
      { op: 'final', marker: 2, evidence: { speechSeconds: 0 } },
      { op: 'interim', marker: 3, evidence: { speechSeconds: 0.1 } },
      { op: 'final', marker: 3, evidence: { speechSeconds: 0.1 } },
      { op: 'interim', marker: 4, evidence: { speechSeconds: 2 } }
    ])
    expect(c.captions('a:1').map(r => r.final)).toEqual([false, true])
    expect(c.captions('a:2')).toEqual([])
    expect(c.captions('a:3')).toEqual([])
    expect(c.captions('a:4').map(r => r.final)).toEqual([false])
  } finally { await t.close() }
})

it('uses a segment\'s evidence when Stop finalizes it, and carries nothing into the next session', async () => {
  const t = await harness()
  try {
    const c = t.client()
    await c.request({ op: 'init' })
    await c.decode('b:1', 5, false, { speechSeconds: 1.5 })
    await c.request({ op: 'stop' })
    expect(t.calls.at(-1)).toEqual({ op: 'final', marker: 5, evidence: { speechSeconds: 1.5 } })
    expect(c.captions('b:1').at(-1)).toMatchObject({ text: OUTRO, final: true })

    // A second Stop has nothing left to finalize.
    const count = t.calls.length
    await c.request({ op: 'stop' })
    expect(t.calls).toHaveLength(count)

    await c.request({ op: 'init' })
    const reply = await c.decode('c:1', 6, true)
    expect(kept(reply)).toBe(false)
    expect(t.calls.at(-1)).toEqual({ op: 'final', marker: 6, evidence: undefined })
  } finally { await t.close() }
})

it('does not carry evidence from a closed connection to its replacement', async () => {
  const t = await harness()
  try {
    const first = t.client()
    await first.request({ op: 'init' })
    await first.decode('d:1', 7, false, { speechSeconds: 2 })
    await first.disconnect()
    await vi.waitFor(() => expect(t.pipeline.stop).toHaveBeenCalled())

    const second = t.client()
    await second.request({ op: 'init' })
    await second.decode('e:1', 8, false)
    const reply = await second.decode('e:2', 9, true)
    expect(kept(reply)).toBe(false)
    expect(t.calls.filter(call => call.marker !== 7)).toEqual([
      { op: 'interim', marker: 8, evidence: undefined },
      { op: 'final', marker: 8, evidence: undefined },
      { op: 'final', marker: 9, evidence: undefined }
    ])
    expect(second.captions('e:1')).toEqual([])
  } finally { await t.close() }
})
