import { EventEmitter } from 'events'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock('electron', () => ({ utilityProcess: { fork: mocks.fork } }))
import { WorkerPool } from './worker-pool'

class FakeWorker extends EventEmitter {
  model = ''
  messages: Array<Record<string, unknown>> = []
  hold = false
  failInit = false
  postMessage(message: Record<string, unknown>) {
    this.messages.push(message)
    queueMicrotask(() => {
      if (message.type === 'init') {
        this.model = String(message.modelPath)
        this.emit('message', this.failInit ? { type: 'error', message: 'load failed' } : { type: 'ready' })
      } else if (message.type === 'dispose') this.emit('message', { type: 'disposed' })
      else if (!this.hold) this.emit('message', { type: 'result', id: message.id, text: this.model })
    })
  }
  kill() { return true }
}
let worker: FakeWorker
beforeEach(() => { worker = new FakeWorker(); mocks.fork.mockReset().mockReturnValue(worker) })

it('finishes an active request before switching models and restores each caller model', async () => {
  const pool = new WorkerPool()
  const a = { modelPath: 'a' }, b = { modelPath: 'b' }
  await pool.acquire(a)
  worker.hold = true
  const first = pool.sendRequest({ type: 'translate' }, 'translate', a)
  await vi.waitFor(() => expect(worker.messages.filter(m => m.type === 'translate')).toHaveLength(1))
  const acquiring = pool.acquire(b)
  await Promise.resolve()
  expect(worker.model).toBe('a')
  const message = worker.messages.find(m => m.type === 'translate')!
  worker.hold = false
  worker.emit('message', { type: 'result', id: message.id, text: 'a' })
  expect(await first).toBe('a')
  await acquiring
  expect(await pool.sendRequest({ type: 'translate' }, 'translate', a)).toBe('a')
  expect(await pool.sendRequest({ type: 'translate' }, 'translate', b)).toBe('b')
  await pool.release(); await pool.release()
  expect(pool.references).toBe(0)
})

it('does not leak references after failed initialization and allows retry', async () => {
  const pool = new WorkerPool()
  worker.failInit = true
  await expect(pool.acquire({ modelPath: 'a' })).rejects.toThrow('load failed')
  expect(pool.references).toBe(0)
  expect(pool.isAlive).toBe(false)
  worker = new FakeWorker(); mocks.fork.mockReturnValue(worker)
  await pool.acquire({ modelPath: 'a' })
  expect(await pool.sendRequest({ type: 'translate' }, 'translate')).toBe('a')
  await pool.release()
})

it('distinguishes configuration changes at the same model path', async () => {
  const pool = new WorkerPool()
  await pool.acquire({ modelPath: 'a', modelType: 'hunyuan-mt' })
  await pool.acquire({ modelPath: 'a', modelType: 'hunyuan-mt-15' })
  expect(worker.messages.filter(m => m.type === 'init')).toHaveLength(2)
  await pool.release(); await pool.release()
})
it('sends cancellation to the active request and keeps the worker usable', async () => {
 const pool=new WorkerPool(),controller=new AbortController()
 await pool.acquire({modelPath:'a'})
 worker.hold=true
 const request=pool.sendRequest({type:'translate'},'translate',{modelPath:'a'},controller.signal)
 const rejected=expect(request).rejects.toThrow('cancelled')
 await vi.waitFor(()=>expect(worker.messages.some(m=>m.type==='translate')).toBe(true))
 controller.abort()
 const cancel=worker.messages.find(m=>m.type==='cancel')!
 expect(cancel.id).toBe(worker.messages.find(m=>m.type==='translate')!.id)
 worker.emit('message',{type:'error',id:cancel.id,message:'cancelled'})
 await rejected
 worker.hold=false
 expect(await pool.sendRequest({type:'translate'},'translate',{modelPath:'a'})).toBe('a')
 await pool.release()
})
it('does not respawn a released engine for a stale queued request', async () => {
 const pool=new WorkerPool()
 await pool.acquire({modelPath:'a'})
 const release=pool.release()
 const stale=pool.sendRequest({type:'translate'},'translate',{modelPath:'a'})
 await expect(stale).rejects.toThrow('released')
 await release
 expect(mocks.fork).toHaveBeenCalledTimes(1)
 expect(pool.isAlive).toBe(false)
})
