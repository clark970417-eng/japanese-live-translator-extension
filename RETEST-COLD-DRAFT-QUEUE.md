# Other work queued behind an interrupted cold draft

Task: `RETEST-COLD-DRAFT.md` lets captions interrupt a cold 7B draft with
`WorkerPool.terminate()`. Its trade-offs say terminate stops the shared worker
for everyone. The task is to prove, with deterministic tests, what happens to
page-text and draft requests queued behind that draft. Captions must start
promptly; every queued request must be answered once on the caption model or
fail clearly as retryable; nothing may hang, disappear, run twice or return a
terminated-worker result; and Stop must drain.

**Result:** the named sequence was already safe. Three adjacent sequences were
not, and are fixed:

- captions arriving while the previous text model is being released;
- a browser reconnecting during a cold draft;
- a hot swap waiting out the dispose grace.

Live-audio priority is unchanged, and no second resident worker was added.

## How it is tested

`src/main/cold-draft-queue.test.ts` drives the companion through its real socket
protocol. It differs from `draft-model-concurrency.test.ts`, which fakes the
translators, in what it keeps real:

- **Real:** the companion, `CompanionScheduler`, `HunyuanMT15Translator`,
  `HunyuanMT2Translator`, `LlamaWorkerTranslator` and the process-wide
  `WorkerPool`.
- **Faked:** only the model process. The small model loads at once, the 7B load
  never finishes, and every `translate` the process receives is recorded
  together with the model that ran it.
- **Pipeline:** the test pipeline starts a real `HunyuanMT15Translator` on the
  shared pool and translates through it on `decode`. Captions therefore need
  the same worker the draft was loading.

## Why the named sequence was already safe

Page-text and draft requests from the browser wait in `CompanionScheduler`, not
in the pool. The companion runs one operation at a time, so when captions
interrupt the draft, the only pool work is the draft itself.

The queued requests start only after `init` and `decode`. By then the pipeline
is running, so a queued draft chooses the caption model and page text keeps
using it. The first test passed on unchanged code, and it is kept as the
regression guard for that argument.

## Defects found and fixed

| Sequence | Before | Fix |
| --- | --- | --- |
| A page-text request left the small model loaded. A draft then starts and, while the companion waits for the worker to confirm the small model's disposal, `init` and `decode` arrive. | The preemption fired before the draft's interrupt listener existed, and a listener added to an aborted signal never runs. The 7B load started anyway and **captions waited behind it**; the test timed out. | The companion interrupts at once if the signal is already aborted. An interrupted `LlamaWorkerTranslator` is finished: `initialize` rejects before `acquire`, a queued `acquire` leaves the pool queue through its signal, and new requests are refused. |
| The browser disconnects during a cold draft with page text queued, then reconnects and starts captions. | A closed socket did not preempt its active task. The new connection waits for the old queue to drain, which meant waiting for the 7B load to finish, up to the 5-minute initialization timeout. **Captions timed out.** | On close the companion preempts its active task through the scheduler, exactly as arriving audio does. The closed connection's queued work sends nothing and runs no model call. |
| Terminate while a hot swap waits for the worker to confirm a dispose. | A killed process never confirms, so the swap waited the full 1 s grace, then failed on a missing worker. | `terminate` ends the dispose wait, and a load with no worker rejects immediately. |

Two further corrections:

- **Retryable error:** `terminate` now rejects with `WorkerTerminatedError`,
  which carries `retryable: true`. The message is unchanged.
- **Stale cancellation:** a request already failed by terminate ignores a later
  abort of its signal. Before, that abort posted a cancel to the killed process
  and scheduled a forced kill of its process id one second later, when the id
  could belong to another process.

## Tests

New in `src/main/cold-draft-queue.test.ts`, five tests through the socket:

1. **The requested sequence:**
   - Setup: a cold 7B draft starts. Page text, a second draft and more page text
     queue behind it. Then `init` and `decode` arrive.
   - Captions: both answer within 1.5 s with the small model's text.
   - Queued work: all four earlier requests are answered exactly once, after
     the caption, on the small model, and the interrupted draft carries
     `fallbackModel: true`. No translation ran twice or on 7B, 7B was loaded
     exactly once, its process was killed, and no response carries the
     termination reason.
   - Stop: it answers, the pipeline stops, and nothing arrives in the 100 ms
     after it.
2. **Captions arriving while the previous model is being released:** fails on
   the unchanged companion.
3. **Captions queued before the draft reaches the worker at all.**
4. **Stop, rather than captions, interrupting a cold draft with page text
   queued:** Stop answers within the bound, and both requests are answered on
   the small model.
5. **Disconnect during a cold draft, then reconnect:** captions answer within
   the bound, the closed connection's requests are never translated, and 7B is
   not reloaded. This fails without the close preemption.

New in `src/main/worker-pool.test.ts`, four tests:

- Terminated in-flight work is a retryable `WorkerTerminatedError`, and a
  request queued behind it runs once on a fresh worker.
- A hot swap waiting for dispose rejects within 250 ms of terminate. This fails
  without the change, taking 1009 ms.
- An acquire aborted while waiting starts no load.
- A request already failed by terminate sends no cancel and triggers no second
  kill. This fails without the change.

New in `src/engines/translator/LlamaWorkerTranslator.test.ts`, three tests:

- No acquire after an early interrupt.
- `acquire` receives the interruption signal.
- Work in progress fails as terminated, the pool is terminated before the
  signal aborts, and later requests are refused without reaching the pool.

Each fix was removed in turn and its test was confirmed to fail. One candidate
check survived removal, a `throwIfAborted` inside `acquire`, because the queue's
signal handling already covers it, so it was deleted rather than kept untested.

Desktop suite: **612 → 624 passed** across 62 files; `tsc --build` clean.

## What was not changed, and limitations

- **A request already dispatched to the worker when terminate fires is not
  retried automatically.** It fails with `WorkerTerminatedError`. In the
  companion that request can only be the interrupted draft itself, which is
  rescheduled on the caption model. Any other `WorkerPool` user in the desktop
  app sees the retryable error and decides for itself.
- **The companion does not add a `retryable` field** to socket error responses.
  No socket sequence tested here produces a terminated-worker error for any
  request other than the draft, and no extension code would read the field.
- **Deterministic tests only, no model-backed measurement.** The real 7B
  terminate-and-respawn cost is the one measured in `RETEST-COLD-DRAFT.md`.
  The reconnect fix was not measured with real models, and the browser's own
  reconnect behaviour is a Task 4 item.
- **Stop during a cold draft now interrupts it**, as `init` and `decode` do. The
  draft is then finished on the small model, which the response marks.
