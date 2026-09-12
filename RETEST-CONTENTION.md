# Stage 1 evidence: live-caption starvation on the shared HY-MT worker

This report covers the shared-worker contention named as the highest priority in
`CLAUDE-HANDOFF.md`. It does not claim that the reported 8.4-second installed
spike is eliminated; see "What is not established" below.

## Root cause

`CompanionScheduler` applies audio preference only when choosing the next
operation. `pump` awaits an operation it has already started, so a page-text
operation that entered the serial slot holds it until completion.

`translateWrittenDraft` makes up to four sequential model calls inside one such
operation: the full draft, then each of up to three clauses. Arriving audio
therefore waited for up to four generations, not one. The worker pool has
supported cooperative cancellation since 3.8.4, but nothing connected arriving
audio to work already in flight.

## Change

- `CompanionScheduler.run` passes an `AbortSignal` to each operation. Enqueuing
  an audio-priority operation aborts the signal of the active page-text
  operation. Operations that ignore the signal keep their previous behavior.
- `translateWrittenDraft` accepts that signal and applies it only to the
  optional repair. The first full translation is never interrupted, so a
  requested draft is always produced; a released repair returns the completed
  draft with the existing review warning.
- `extension-companion.ts` forwards the signal to the written-draft path only.

Files: `src/main/companion-scheduler.ts`, `src/main/draft-fidelity.ts`,
`src/main/extension-companion.ts`.

## Deterministic reproduction

`src/main/companion-contention.test.ts` uses the real scheduler and the real
`translateWrittenDraft` with a strictly serial fake worker at 400 ms per call.
Absolute values are a property of the fake worker; the measurement is how many
generations audio waits behind.

| Audio operation | Before | After |
| --- | ---: | ---: |
| first | 1504 ms | 302 ms |
| second | 1907 ms | 702 ms |
| third | 2307 ms | 1102 ms |

Draft model calls fell from 4 to 1. After the change the remaining waits are
each audio operation's own serial cost, not draft time.

## Matched real-engine measurement

`scripts/benchmark-draft-contention.ts`, MLX Whisper large-v3-turbo with
HY-MT1.5 1.8B Q4_K_M, JSUT BASIC5000_4501–4505, growing windows at 0.8, 1.6,
2.8, 4.5, 6.5 and 8.5 seconds, one typed draft enqueued during the first window
of every trial. Both modes alternate inside one process, so model state, thermal
state and machine load are shared. `baseline` withholds the preemption signal;
`preempt` passes it. Five pairs. Capture, VAD and rendering are bypassed.

| Engine-and-scheduling measurement | baseline | preempt |
| --- | ---: | ---: |
| Queue age of an audio operation, median | 1219 ms | 174 ms |
| Queue age, p95 | 1243 ms | 373 ms |
| Queue age, max | 1243 ms | 373 ms |
| Final delay after speech end, median | 1214 ms | 504 ms |
| Final delay, max | 1573 ms | 762 ms |
| First Japanese, median | 1169 ms | 1166 ms |
| First Chinese, median | 1908 ms | 2070 ms |
| Draft model calls per trial | 4 | 1 |
| Drafts repaired | 5 / 5 | 0 / 5 |
| Missing final captions | 0 / 5 | 0 / 5 |
| Peak resident memory across processes | 1473 MB | 1462 MB |

Raw rows: `tests/results/contention-matched.jsonl`. A one-pair smoke run is in
`tests/results/contention-smoke.jsonl`.

First Japanese is unchanged, as expected: recognition never shared the
contended worker. First Chinese shows no improvement and its median is 162 ms
worse under preemption, which is within the spread of five trials on a machine
under normal use; it is not evidence of a regression or of a gain.

## Accepted trade-off

While captions are active, the 3.8.5 uncertainty repair no longer completes:
repaired drafts went from 5/5 to 0/5 in the matched run. The draft itself is
always returned, with the review warning that says the uncertainty may be lost.
This is the behavior the handoff's completion condition permits, and it is a
deliberate exchange of optional written-draft quality for live-caption latency.
Deferring the repair until the scheduler is idle was rejected because a
livestream may never go idle, which would delay the draft indefinitely.

## Regression coverage

- `companion-contention.test.ts`: audio preempts the repair; the repair still
  runs to four calls and returns `repaired` when no audio contends.
- `extension-companion.test.ts`: through the socket protocol, a cancelled repair
  releases the worker for an arriving decode, the draft returns with its review
  warning, execution order is draft, repair, audio, and stop returns without an
  error response.

Suites after the change: 553 desktop tests across 54 files, 70 extension tests,
`tsc --build` clean, production build clean. One pre-existing `prefer-const`
lint error at `extension-companion.ts:54` is present at `d6284b2` and was left
alone.

## What is not established

- The 8.4-second installed spike was not reproduced at that magnitude. This
  harness produced a 1243 ms baseline maximum because its drafts are short and
  the worker is warm. The relative improvement is measured; the specific spike
  class named in the handoff can only be retired by an installed Opera run.
- The first full draft translation remains unbounded and uninterruptible by
  design. A long typed comment can still hold the worker for one long
  generation. That residual is not addressed here.
- No installed desktop or extension verification, no long-session run, and no
  Stop/Start cycling under real capture were performed.
- Five pairs on one read-speech speaker is not a latency distribution for live
  streams, and machine load was not held constant.

## Codex cross-review

`.claude/rules/behavior.md` requires a Codex MCP design review. Codex MCP was
not available in this session. The documented fallback was used: the change
reuses the existing 3.8.4 cooperative-cancellation path in `worker-pool.ts`
rather than introducing a new pattern, and no separate worker process was added.

## Companion socket path, before and after

`scripts/verify-companion-host.ts` starts the production `startExtensionCompanion`
with the production pipeline and engines in a contained profile and socket
directory. It skips `index.ts`, so no onboarding downloader, window, shortcut or
updater runs. `scripts/verify-installed-contention.mjs` then speaks the socket
protocol the way `background.js` does: `init`, growing non-final `decode`
windows, a `translate` typed comment during the first window, a final `decode`,
then `stop` and a second `init`.

Three trials per build on JSUT BASIC5000_4501–4503, alternating the typed
comment between the handoff's repair case and a longer comment. The same
contained profile, models and machine state were used for both builds; the
change was removed with `git stash` to produce the baseline and restored
afterwards.

| Companion-path measurement | before | after |
| --- | ---: | ---: |
| Audio window round trip, max | 1943 ms | 1434 ms |
| Audio window round trip, median of trial medians | 971 ms | 977 ms |
| Typed-draft response, max | 2019 ms | 1409 ms |
| Typed-draft response, median | 1734 ms | 1252 ms |
| Drafts repaired | 2 / 3 | 0 / 3 |
| Drafts returned with a review warning | 0 / 3 | 2 / 3 |
| Blank captions | 0 | 0 |
| Reordered captions | 0 | 0 |
| Late captions after stop | 0 | 0 |
| Second `init` after stop | ok | ok |

Raw rows: `tests/results/companion-path-before.jsonl` and
`tests/results/companion-path-after.jsonl`.

Chinese arrived before the end of the audio in every trial of both builds, so
the audio-end-to-Chinese figure is negative throughout and is not a useful
discriminator on this fixture.

### The gate item that remains open

The 8.4-second spike was **not reproduced on this path even by the baseline
build**; its worst audio round trip was 1943 ms. Three trials with fixed
windows, no capture and no VAD are milder than the installed Opera session that
produced the original report. The contention is measurably smaller and the
caption-integrity checks pass, but the specific spike class named in the handoff
cannot be declared retired from this evidence. That still needs an installed
Opera run, which cannot be driven from this session.
