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

it('routes provisional text only to its active request and ignores it after abort or completion', async () => {
 const pool=new WorkerPool(),controller=new AbortController(),partial=vi.fn()
 await pool.acquire({modelPath:'a'});worker.hold=true
 const result=pool.sendRequest({type:'translate'},'translate',{modelPath:'a'},controller.signal,partial)
 const cancelled=expect(result).rejects.toThrow('cancelled')
 await vi.waitFor(()=>expect(worker.messages.some(m=>m.type==='translate')).toBe(true))
 const message=worker.messages.find(m=>m.type==='translate')!
 expect(message.streamOutput).toBe(true)
 worker.emit('message',{type:'partial',id:'other',text:'wrong'})
 worker.emit('message',{type:'partial',id:message.id,text:'今天先去'})
 expect(partial).toHaveBeenCalledExactlyOnceWith('今天先去')
 controller.abort()
 worker.emit('message',{type:'partial',id:message.id,text:'cancelled'})
 worker.emit('message',{type:'result',id:message.id,text:'final'})
 await cancelled
 worker.emit('message',{type:'partial',id:message.id,text:'late'})
 expect(partial).toHaveBeenCalledTimes(1)
 await pool.release()
})

it('cancels a timed out inference and keeps the next request blocked until acknowledgement', async () => {
 vi.useFakeTimers()
 try {
  const pool=new WorkerPool()
  await pool.acquire({modelPath:'a'}); worker.hold=true
  const first=pool.sendRequest({type:'translate'},'translate',{modelPath:'a'})
  const failure=expect(first).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(0)
  const id=worker.messages.find(m=>m.type==='translate')!.id
  const second=pool.sendRequest({type:'translate'},'translate',{modelPath:'a'})
  await vi.advanceTimersByTimeAsync(30_000)
  expect(worker.messages.some(m=>m.type==='cancel' && m.id===id)).toBe(true)
  expect(worker.messages.filter(m=>m.type==='translate')).toHaveLength(1)
  worker.hold=false
  worker.emit('message',{type:'result',id,text:'late result'})
  await failure
  expect(await second).toBe('a')
  await pool.release()
 } finally {vi.useRealTimers()}
})

it('replaces an unresponsive process after cancellation grace and restores the queued model', async () => {
 vi.useFakeTimers()
 try {
  const pool=new WorkerPool(), controller=new AbortController()
  await pool.acquire({modelPath:'a'})
  const old=worker; old.hold=true
  const kill=vi.spyOn(old,'kill')
  const first=pool.sendRequest({type:'translate'},'translate',{modelPath:'a'},controller.signal)
  const failure=expect(first).rejects.toThrow('cancelled')
  await vi.advanceTimersByTimeAsync(0)
  const oldId=old.messages.find(m=>m.type==='translate')!.id
  const next=pool.sendRequest({type:'translate'},'translate',{modelPath:'b'})
  worker=new FakeWorker();mocks.fork.mockReturnValue(worker)
  controller.abort()
  await vi.advanceTimersByTimeAsync(999)
  expect(mocks.fork).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await failure
  expect(await next).toBe('b')
  expect(kill).toHaveBeenCalledTimes(1)
  expect(pool.references).toBe(1)
  old.emit('exit',1)
  old.emit('message',{type:'result',id:oldId,text:'obsolete'})
  expect(await pool.sendRequest({type:'translate'},'translate',{modelPath:'b'})).toBe('b')
  await pool.release()
 } finally {vi.useRealTimers()}
})

it('frees queue capacity when obsolete waiting translations are cancelled', async () => {
 const pool=new WorkerPool()
 await pool.acquire({modelPath:'a'});worker.hold=true
 const active=pool.sendRequest({type:'translate'},'translate',{modelPath:'a'})
 await vi.waitFor(()=>expect(worker.messages.some(m=>m.type==='translate')).toBe(true))
 const controllers=Array.from({length:49},()=>new AbortController())
 const obsolete=controllers.map(controller=>pool.sendRequest({type:'translate'},'translate',{modelPath:'a'},controller.signal).catch(error=>error.message))
 await expect(pool.sendRequest({type:'translate'},'translate',{modelPath:'a'})).rejects.toThrow('queue is full')
 controllers.forEach(controller=>controller.abort())
 expect(await Promise.all(obsolete)).toEqual(Array(49).fill('Translation cancelled'))
 const next=pool.sendRequest({type:'translate'},'translate',{modelPath:'a'})
 worker.hold=false
 worker.emit('message',{type:'result',id:worker.messages.find(m=>m.type==='translate')!.id,text:'a'})
 await active
 expect(await next).toBe('a')
 expect(worker.messages.filter(m=>m.type==='translate')).toHaveLength(2)
 await pool.release()
})
