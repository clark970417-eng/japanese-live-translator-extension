import { expect, it } from 'vitest'
import { SerialTaskQueue } from './serial-task-queue'

it('removes cancelled waiting work immediately without running it or disturbing FIFO', async () => {
  const queue = new SerialTaskQueue(), order: number[] = []
  let finish!: () => void
  const active = queue.run(() => new Promise<void>(resolve => { finish = resolve }))
  const controller = new AbortController()
  const cancelled = queue.run(async () => { order.push(0) }, controller.signal)
  const rejected = expect(cancelled).rejects.toThrow('cancelled')
  const next = queue.run(async () => { order.push(1); throw new Error('expected') })
  const failure = expect(next).rejects.toThrow('expected')
  const last = queue.run(async () => { order.push(2) })
  controller.abort()
  await rejected
  expect(order).toEqual([])
  finish()
  await Promise.all([active, failure, last])
  expect(order).toEqual([1, 2])
})
