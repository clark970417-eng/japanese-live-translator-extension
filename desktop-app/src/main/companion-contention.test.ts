/** Stage 1: live-caption starvation while a written draft holds the shared
 * HY-MT worker. Deterministic — no model, no audio device.
 *
 * The fake translator is strictly serial with a fixed per-call cost, which is
 * what the real worker pool provides. Absolute milliseconds here are not
 * latency evidence for the product; the measurement is how many model calls an
 * audio operation must wait behind.
 *
 * Baseline before preemption, with CALL_MS at 400: the optional repair ran four
 * sequential calls inside one scheduler task and the three audio operations
 * waited 1504, 1907 and 2307 ms.
 */
import { expect, it } from 'vitest'
import { CompanionScheduler } from './companion-scheduler'
import { translateWrittenDraft } from './draft-fidelity'

/** Approximate cost of one short HY-MT1.5 call on this machine. */
const CALL_MS = 400

/** The written draft reported in the 3.8.5 handoff, which takes the repair path. */
const DRAFT_SOURCE = '明天可能沒辦法來看，但我會看直播存檔，不要勉強自己喔'

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Serial fake worker. Returns an uncertainty marker only for a single clause,
 * so the full-draft translation looks lossy and the repair path runs. */
function createWorker(): { translate: (text: string) => Promise<string>, calls: () => number } {
  let chain: Promise<unknown> = Promise.resolve()
  let calls = 0
  const translate = (text: string): Promise<string> => {
    const run = chain.then(async () => {
      calls++
      await sleep(CALL_MS)
      if (text === DRAFT_SOURCE) return '明日は見られません。'
      if (text.includes('可能')) return 'かもしれません。'
      // A request to the reader, rendered the way a correct clause would be.
      return text.includes('不要') ? '無理しないでくださいね。' : 'はい。'
    })
    chain = run.catch(() => {})
    return run
  }
  return { translate, calls: () => calls }
}

/** Wait from enqueue to first execution, per audio operation. */
async function measureAudioWaits(audioCount: number): Promise<{
  waits: number[]
  draftCalls: number
  draft: Awaited<ReturnType<typeof translateWrittenDraft>>
}> {
  const queue = new CompanionScheduler()
  const worker = createWorker()

  // The written draft starts first and occupies the single serial slot.
  const draft = queue.run(false, preempt => translateWrittenDraft(DRAFT_SOURCE, worker.translate, preempt))
  await sleep(CALL_MS / 4)

  const waits: number[] = []
  const audio = Array.from({ length: audioCount }, () => {
    const enqueued = performance.now()
    return queue.run(true, async () => {
      waits.push(performance.now() - enqueued)
      await worker.translate('みなさん、こんにちは。')
    })
  })

  const [completed] = await Promise.all([draft, ...audio])
  return { waits, draftCalls: worker.calls() - audioCount, draft: completed }
}

it('lets live audio preempt optional draft repair on the shared worker', async () => {
  const { waits, draftCalls, draft } = await measureAudioWaits(3)

  // Only the first full translation runs; the optional repair is released.
  expect(draftCalls).toBe(1)

  // Audio waits for that one in-flight call, not for four.
  expect(waits[0]).toBeLessThan(CALL_MS * 1.5)
  expect(Math.max(...waits)).toBeLessThan(CALL_MS * 3)

  // The requested draft is never destroyed; it returns for review instead.
  expect(draft.text).toBe('明日は見られません。')
  expect(draft.reviewWarning).toBeTruthy()
  expect(draft.repaired).toBeFalsy()

  console.log('[stage1-after] draft model calls:', draftCalls)
  console.log('[stage1-after] audio wait ms:', waits.map(wait => Math.round(wait)).join(', '))
})

it('still repairs a lost uncertainty marker when no audio contends', async () => {
  const { draftCalls, draft } = await measureAudioWaits(0)

  expect(draftCalls).toBe(4)
  expect(draft.repaired).toBe(true)
  expect(draft.reviewWarning).toBeUndefined()
  expect(draft.text).toContain('かもしれません')
  expect(draft.text).toContain('無理しないでください')
})
