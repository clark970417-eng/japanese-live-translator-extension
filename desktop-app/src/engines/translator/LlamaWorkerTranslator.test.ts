/** An interrupted engine is finished: it neither loads nor sends any more work. */
import { expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ utilityProcess: { fork: vi.fn() } }))
vi.mock('../model-downloader', () => ({ getGGUFDir: () => '/models', downloadGGUF: vi.fn(async () => '') }))

import { HunyuanMT2Translator } from './HunyuanMT2Translator'
import { WorkerTerminatedError, type WorkerPool } from '../../main/worker-pool'

function fakePool() {
  const order: string[] = []
  const pool = {
    acquire: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    terminate: vi.fn(() => { order.push('terminate') }),
    sendRequest: vi.fn((_message: unknown, _type: string, _options: unknown, signal?: AbortSignal) =>
      new Promise<string>((resolve, reject) => {
        signal?.addEventListener('abort', () => { order.push('abort'); reject(signal.reason) }, { once: true })
        if (!signal) resolve('')
      }))
  }
  return { pool, order }
}

it('does not acquire the worker after an interrupt that arrived before the load began', async () => {
  const { pool } = fakePool()
  const engine = new HunyuanMT2Translator({ variant: '7B-Q4_K_M', pool: pool as unknown as WorkerPool })
  engine.interrupt('Live captions started')
  await expect(engine.initialize()).rejects.toBeInstanceOf(WorkerTerminatedError)
  expect(pool.acquire).not.toHaveBeenCalled()
})

it('passes an interruption signal to acquire, so an acquire still waiting in the pool gives up', async () => {
  const { pool } = fakePool()
  let seen: AbortSignal | undefined
  pool.acquire.mockImplementation(async (...args: unknown[]) => { seen = args[2] as AbortSignal })
  const engine = new HunyuanMT2Translator({ variant: '7B-Q4_K_M', pool: pool as unknown as WorkerPool })
  await engine.initialize()
  expect(seen?.aborted).toBe(false)
  engine.interrupt('Live captions started')
  expect(seen?.aborted).toBe(true)
})

it('fails work in progress as terminated and refuses new work after an interrupt', async () => {
  const { pool, order } = fakePool()
  const engine = new HunyuanMT2Translator({ variant: '7B-Q4_K_M', pool: pool as unknown as WorkerPool })
  await engine.initialize()
  const caller = new AbortController()
  const running = engine.translate('你好', 'zh', 'ja', { signal: caller.signal, previousSegments: [] })
  engine.interrupt('Live captions started')
  await expect(running).rejects.toBeInstanceOf(WorkerTerminatedError)
  // The pool is stopped before in-flight work is told to abort.
  expect(order).toEqual(['terminate', 'abort'])
  await expect(engine.translate('再見', 'zh', 'ja')).rejects.toBeInstanceOf(WorkerTerminatedError)
  expect(pool.sendRequest).toHaveBeenCalledTimes(1)
  await engine.dispose()
  expect(pool.release).toHaveBeenCalledTimes(1)
})
