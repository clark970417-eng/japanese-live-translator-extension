import { it, expect, vi, afterEach } from 'vitest'
import { CorrectionRouter, type CorrectionOutcome } from './correction-router'

afterEach(() => { vi.useRealTimers() })

/** A correction the test finishes by hand, which rejects when aborted. */
function manualCorrection() {
  const calls: Array<{ source: string, signal: AbortSignal, resolve: (text: string) => void }> = []
  const correct = (source: string, signal: AbortSignal): Promise<string> => new Promise((resolve, reject) => {
    calls.push({ source, signal, resolve })
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  return { calls, correct }
}

function router(correct: (s: string, signal: AbortSignal) => Promise<string>, deadlineMs = 2500) {
  const published: Array<[string, string]> = []
  const outcomes: Array<[string, CorrectionOutcome]> = []
  const instance = new CorrectionRouter({
    correct, deadlineMs,
    publish: (segment, text) => published.push([segment, text]),
    onOutcome: (segment, outcome) => outcomes.push([segment, outcome])
  })
  return { instance, published, outcomes }
}

it('publishes a differing correction that lands before the deadline', async () => {
  const { instance, published, outcomes } = router(async () => '這個技能的冷卻時間結束了')
  instance.submit('s1', 'スキルのクールタイムが明けた', '技能的有效時間結束了')
  await vi.waitFor(() => expect(outcomes).toEqual([['s1', 'published']]))
  expect(published).toEqual([['s1', '這個技能的冷卻時間結束了']])
})

it('returns from submit without waiting for the correction', () => {
  const manual = manualCorrection()
  const { instance } = router(manual.correct)
  const began = performance.now()
  instance.submit('s1', '源', '即時')
  expect(performance.now() - began).toBeLessThan(5)
  expect(manual.calls).toHaveLength(0) // not even started synchronously
})

it('aborts at the deadline and refuses a late answer', async () => {
  vi.useFakeTimers()
  let lateResolve!: (text: string) => void
  let seenSignal!: AbortSignal
  // Ignores the signal, like a model that finishes anyway.
  const { instance, published, outcomes } = router((_s, signal) => { seenSignal = signal; return new Promise(r => { lateResolve = r }) }, 2500)
  instance.submit('s1', '源', '即時')
  await vi.advanceTimersByTimeAsync(2501)
  expect(seenSignal.aborted).toBe(true)
  lateResolve('遲到的修正')
  await vi.advanceTimersByTimeAsync(0)
  expect(published).toEqual([])
  expect(outcomes).toEqual([['s1', 'deadline']])
})

it('never lets an older correction replace a newer caption', async () => {
  let resolveOld!: (text: string) => void
  let oldSignal!: AbortSignal
  const correct = vi.fn()
    .mockImplementationOnce((_s: string, signal: AbortSignal) => { oldSignal = signal; return new Promise<string>(r => { resolveOld = r }) })
    .mockImplementationOnce(async () => '新的修正')
  const { instance, published, outcomes } = router(correct)
  instance.submit('s1', '舊', '舊即時')
  await vi.waitFor(() => expect(correct).toHaveBeenCalledTimes(1))
  instance.submit('s2', '新', '新即時')
  expect(oldSignal.aborted).toBe(true)
  // The old model ignores the abort and answers after the newer caption exists.
  resolveOld('舊的修正')
  await vi.waitFor(() => expect(outcomes.map(([s]) => s).sort()).toEqual(['s1', 's2']))
  expect(published).toEqual([['s2', '新的修正']])
  expect(outcomes).toContainEqual(['s1', 'superseded'])
})

it('does not publish a correction identical to the immediate caption', async () => {
  const { instance, published, outcomes } = router(async () => ' 一樣的譯文 ')
  instance.submit('s1', '源', '一樣的譯文')
  await vi.waitFor(() => expect(outcomes).toEqual([['s1', 'unchanged']]))
  expect(published).toEqual([])
})

it('publishes nothing after stop', async () => {
  const manual = manualCorrection()
  const { instance, published, outcomes } = router(manual.correct)
  instance.submit('s1', '源', '即時')
  await vi.waitFor(() => expect(manual.calls).toHaveLength(1))
  instance.stop()
  manual.calls[0].resolve('停止後的修正')
  await vi.waitFor(() => expect(outcomes).toEqual([['s1', 'stopped']]))
  expect(published).toEqual([])
})

it('contains a failed correction without affecting the caption', async () => {
  const { instance, published, outcomes } = router(async () => { throw new Error('worker exited') })
  expect(() => instance.submit('s1', '源', '即時')).not.toThrow()
  await vi.waitFor(() => expect(outcomes).toEqual([['s1', 'failed']]))
  expect(published).toEqual([])
})
