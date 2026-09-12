import { it, expect, vi, beforeEach } from 'vitest'
const state = vi.hoisted(() => ({ command: vi.fn(), dispose: vi.fn(), initialize: vi.fn() }))
vi.mock('../SubprocessBridge', () => ({
  SubprocessBridge: class {
    process: unknown = {}
    log = { error: vi.fn(), warn: vi.fn() }
    sendCommand(...args: unknown[]) { return state.command(...args) }
    async dispose() { await state.dispose(); this.process = null }
    async initialize() { await state.initialize(); this.process = {} }
  },
  getEnrichedPath: () => '', resolveBridgeScript: () => ''
}))
import { MlxWhisperEngine } from './MlxWhisperEngine'
beforeEach(() => { vi.resetAllMocks() })
it('restarts a timed-out recognizer and accepts the next utterance', async () => {
  state.command.mockRejectedValueOnce(new Error('Bridge command timed out')).mockResolvedValueOnce({ text: 'こんにちは', language: 'ja' })
  const engine = new MlxWhisperEngine()
  expect(await engine.processAudio(new Float32Array(16000),16000)).toBeNull()
  expect(state.dispose).toHaveBeenCalledTimes(1)
  expect(state.initialize).toHaveBeenCalledTimes(1)
  expect(await engine.processAudio(new Float32Array(16000),16000)).toMatchObject({text:'こんにちは'})
})
it('does not restart after the user stops during timeout cleanup', async () => {
  let release!: () => void
  state.command.mockRejectedValueOnce(new Error('Bridge command timed out'))
  state.dispose.mockImplementationOnce(() => new Promise<void>(resolve => { release=resolve }))
  const engine = new MlxWhisperEngine()
  const request = engine.processAudio(new Float32Array(16000),16000)
  await vi.waitFor(() => expect(state.dispose).toHaveBeenCalledTimes(1))
  await engine.dispose()
  release()
  await request
  expect(state.initialize).not.toHaveBeenCalled()
})

it('recovers from an unexpected child exit but not an intentional stop', async () => {
  const engine = new MlxWhisperEngine()
  await engine.initialize()
  ;(engine as unknown as {process: unknown}).process = null
  state.command.mockResolvedValue({text:'再開しました',language:'ja'})
  expect(await engine.processAudio(new Float32Array(16000),16000)).toMatchObject({text:'再開しました'})
  expect(state.initialize).toHaveBeenCalledTimes(2)
  await engine.dispose()
  expect(await engine.processAudio(new Float32Array(16000),16000)).toBeNull()
  expect(state.initialize).toHaveBeenCalledTimes(2)
})
