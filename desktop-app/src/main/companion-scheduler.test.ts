import { expect, it } from 'vitest'
import { CompanionScheduler } from './companion-scheduler'

it('keeps inference serial while queued audio passes page text in FIFO order', async () => {
  const queue = new CompanionScheduler()
  const order: string[] = []
  let release!: () => void
  const active = queue.run(false, () => new Promise<void>(resolve => { release = resolve }))
  const text = queue.run(false, async () => { order.push('text') })
  const audio1 = queue.run(true, async () => { order.push('audio1') })
  const audio2 = queue.run(true, async () => { order.push('audio2') })
  expect(order).toEqual([])
  release()
  await Promise.all([active, text, audio1, audio2])
  expect(order).toEqual(['audio1', 'audio2', 'text'])
})

it('does not starve text under sustained audio, and recovers from failed work', async () => {
  const queue = new CompanionScheduler()
  const order: string[] = []
  let release!: () => void
  const active = queue.run(false, () => new Promise<void>(resolve => { release = resolve }))
  const tasks = Array.from({length: 8}, (_, n) => queue.run(true, async () => { order.push('audio' + n) }))
  tasks.push(queue.run(false, async () => { order.push('text') }))
  const failure = queue.run(false, async () => { throw new Error('expected') }).catch(error => error.message)
  let idle = false
  const drained = queue.idle().then(() => { idle = true })
  expect(idle).toBe(false)
  release()
  await Promise.all([active, ...tasks, drained])
  expect(order.indexOf('text')).toBe(4)
  expect(await failure).toBe('expected')
  await queue.run(true, async () => { order.push('recovered') })
  expect(order.at(-1)).toBe('recovered')
  expect(idle).toBe(true)
})
