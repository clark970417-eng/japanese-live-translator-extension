# Captions arriving during a cold large-model draft

Task: a cold 7B written draft begins, then browser caption `init` and `decode`
arrive. The caption path must not wait through the 7B model load or its first
generation. Measure the delay before and after.

**Result:** the extra caption delay caused by the draft fell from about 6.5 s to
about 0.8 s at the median, against a no-draft control. No memory was added.

## Baseline

`scripts/measure-cold-draft.mjs` starts a fresh companion host for every trial,
so no model is loaded. It sends the written draft, waits 300 ms, sends `init`,
then streams `decode` windows from JSUT BASIC5000_4506. It spawns the Electron
binary directly so that killing a trial reaches the process holding the models;
no orphaned process remained after any run.

| Before the change | Trial 0 | Trial 1 | Trial 2 |
| --- | ---: | ---: | ---: |
| `init` wait | 16059 ms | 8993 ms | 8085 ms |
| First `decode` wait | 15579 ms | 8507 ms | 7612 ms |
| First Chinese after `init` | 16830 ms | 9761 ms | 8875 ms |
| Draft round trip | 11597 ms | 5738 ms | 5058 ms |

Trial 0 is slowest because the 7B weights were read from disk for the first time.

Two layers made captions wait, and both had to change:

1. `CompanionScheduler` runs one operation at a time. The draft held that slot
   while it loaded 7B, so `init` and `decode` queued behind the whole load and
   first generation even though they have audio priority.
2. `WorkerPool` serializes every acquire and request through one queue, and a
   model swap runs inside it. Releasing the scheduler slot alone would still
   leave the caption model's load queued behind the 7B load.

The deterministic test below failed on the unchanged code: `decode` never
answered within its bound while the fake large model was loading.

## Rejected: a second resident worker for the large model

A dedicated 7B worker would remove both waits without interrupting anything, and
the handoff allows one only if memory measurements prove it safe on this 16 GB
Mac. `scripts/probe-two-workers.mjs` ran live captions on the small model while a
second process loaded and generated with 7B:

| Measured | Captions alone | Captions while 7B generates |
| --- | ---: | ---: |
| `decode` round trip, median | 794 ms | 1607 ms |
| `decode` round trip, max | 939 ms | 1806 ms |
| Lowest system-wide free memory | 47% | 13% |
| Pages swapped out during the probe | 0 | 101,472 |

About 1.5 GB was swapped to disk and caption latency doubled, with the user's
normal applications open. The safety condition is not met, so this design was
not built. Raw rows: `tests/results/two-workers-probe.jsonl`.

## Change

- `WorkerPool.terminate(reason)` stops the worker immediately. It forgets the
  process before it exits, fails an in-flight model load and every pending
  request with the reason, and lets the next acquire spawn a fresh worker.
- A model load now fails as soon as its worker exits. Before this change, a
  worker that died mid-load left the load waiting for a `ready` message until
  the initialization timeout, holding the request queue the whole time.
- A worker's exit handler ignores the exit if that worker was already replaced,
  so a terminated process reporting late cannot clear its replacement.
- `TranslatorEngine` gains an optional `interrupt(reason)`; the llama-based
  translators implement it with `terminate`.
- In `extension-companion.ts`, a written draft on a model the captions do not
  use arms an interrupt on the scheduler's preemption signal. When audio work
  arrives during the load or the first pass, the load is abandoned, the slot is
  released, and the draft is rescheduled as its own task on the caption model,
  answered with `fallbackModel: true`. It is a separate task because awaiting it
  inside the current one would deadlock the serial scheduler.
- If the large model already produced its first pass and is only repairing,
  that draft is kept and returned for review; nothing is rescheduled.

Two defects were found while testing this and fixed in the same change:

- The first version waited about one second after `terminate`: the failed
  acquire called the graceful `killWorker`, which waits out a dispose grace period
  for a reply a killed process never sends. Forgetting the process inside
  `terminate` removed it. A unit test caught this; the mocked companion test
  could not.
- Creating `src/main/worker-pool.test.ts` overwrote an existing file with nine
  tests. It was restored from HEAD byte for byte, all nine pass against the new
  pool, and the new tests were appended as a subclass so the original fake is
  untouched.

## Tests

- `src/main/draft-model-concurrency.test.ts`: through the real socket protocol,
  `init` and `decode` complete while a fake large-model load is still pending, the
  load is interrupted, and the draft is answered afterwards on the caption model.
  A second test keeps a large-model first pass that finished before captions.
- `src/main/worker-pool.test.ts`, five tests added to the nine restored ones:
  mid-load termination rejects within 250 ms; a worker that exits on its own
  fails its load without the timeout; a fresh worker serves the next model and a
  late exit from the terminated one cannot clear it; pending requests reject with
  the reason; terminate with no worker is a no-op.
- Desktop suite 576 passed, reconciled file by file against HEAD's 569;
  `tsc --build` clean.

## Measured result

Same harness, same machine, three cold trials each, plus a control that sends no
draft at all:

| Median of three cold trials | No draft | Before | After |
| --- | ---: | ---: | ---: |
| `init` wait | 2460 ms | 8993 ms | 3224 ms |
| First `decode` wait | 1985 ms | 8507 ms | 2758 ms |
| First Chinese after `init` | 3251 ms | 9761 ms | 4018 ms |
| Draft round trip | — | 5738 ms | 7520 ms |

About 3.2 seconds of caption start-up is the cold host loading the small
translation model and MLX Whisper, and it is there with no draft. Against that
control the draft added about 6.5 s before and about 0.8 s after. The residue is
the 300 ms of large load already under way plus terminating it and spawning a
fresh worker.

Raw rows: `tests/results/cold-draft-baseline.jsonl`,
`tests/results/cold-draft-after.jsonl`, `tests/results/cold-draft-control.jsonl`.

## Regressions and trade-offs

- **In this scenario the draft uses the small model.** The request is answered
  with `fallbackModel: true`, so an interface can say so. The 7B draft is kept
  only when it finished its first pass before captions arrived.
- **The draft itself takes longer here**, 5738 ms to 7520 ms at the median,
  because it now waits behind caption start-up instead of in front of it.
- **`terminate` stops the shared worker for everyone.** Any other request queued
  on that worker at that moment, such as a page-text translation, is rejected
  with the reason and must be retried. In the measured sequence nothing else was
  queued. `RETEST-COLD-DRAFT-QUEUE.md` later showed that the
  companion's own queued requests never reach the pool before captions, and
  fixed three sequences where captions or a reconnect still waited for 7B.
- The draft text differed: before, 7B returned
  `明日は参加できませんかもしれませんが…`, which is ungrammatical; after, the small model
  with the Stage 4 repair returned a grammatical draft with the correct subject.
  That is one sentence and is not claimed as a quality improvement.

## Remaining limitations

- Three trials per condition, one corpus clip, one draft sentence.
- The fixed 300 ms gap is one point on the curve. A gap long enough for the 7B
  load to finish would instead exercise the interrupted-generation path, which
  is covered by a unit test here and not by a real-model measurement.
- Terminate-and-respawn costs are measured only for a cold host on this Mac.
- Browser capture and VAD are not involved; the socket protocol is.
