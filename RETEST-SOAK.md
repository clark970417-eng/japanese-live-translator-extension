# Stage 7 evidence: long session and recovery

The run reached 53 of 60 minutes in good health and then the companion host
process died without a crash report. The gate is **not met**: an unrecoverable
native connection is exactly what it forbids, and the cause is not yet known.

## What was exercised

`scripts/soak-companion.mjs` owns the companion host process, so a real process
restart could be exercised, and drives the production socket protocol. Browser
capture, VAD, tab navigation and extension reload are outside this path.

Speech came from eight authored Kyoko clips frozen in `tests/corpus/soak.json`
(0.25 s to 4.1 s, including a fast-speech and a one-word clip). Non-speech
controls, a typed Chinese draft and a Stop/Start session cycle were interleaved.
These are authored synthetic inputs, not unseen livestream speech.

| Activity in 60 minutes | Count |
| --- | ---: |
| Utterances replayed | 537 |
| Typed drafts during captions | 141 |
| Stop then Start session cycles | 84 |
| Deliberate host process restarts | 2 |
| Non-speech controls | 131 |

## The healthy first 53 minutes

Cycles 1 to 423, up to 3181 seconds:

| Measurement | Value |
| --- | ---: |
| Queue age, median | 731 ms |
| Queue age, p95 | 1947 ms |
| Queue age, max | 5275 ms |
| Final delay after speech end, median | 1931 ms |
| Final delay, p95 | 4078 ms |
| Final delay, max | 7998 ms |
| Blank captions | 0 |
| Missing final captions | 0 |
| Stale captions after Stop | 0 |
| Resident memory, first cycle | 1719 MB |
| Resident memory, last healthy cycle | 1332 MB |

Memory did not grow. Both deliberate restarts recovered: the socket came back,
`init` succeeded and captions resumed, at cycles 169 and 336.

The tail is not hidden by the medians. 24 of 423 cycles had a queue age above
3 seconds, and they arrive in bursts rather than uniformly: cycles 94-96,
112-119, 227-229, 401-403, 408-410 and 418-423. The largest, 5275 ms queue age
and 7998 ms final delay, fall in the last three minutes before the host died,
and the burst sizes grow over that window from 3.0 s to 5.3 s. That looks like
degradation preceding the failure rather than an unrelated spike.

## The failure at 53 minutes

At cycle 424, 3181 seconds in, the host process was no longer measurable and
every later request failed with a closed socket. The harness kept looping for
114 more cycles without measuring anything, which is why the raw summary reports
114 missing finals and a flood of socket errors. Those 114 are dead time, not
114 separate product failures.

Evidence gathered about the cause:

- No macOS crash report for Electron in `~/Library/Logs/DiagnosticReports`.
- No jetsam or memory-status kill in the system log for the window.
- The session log `.test-out/profile/logs/2026-09-12T17-03-26.txt` opens at
  01:03:26 and has no `Session ended` line, so the process died mid-session.
- Resident memory at the last healthy cycle was 1332 MB, far from a limit.

A process that leaves no crash report either exited deliberately or was killed
with SIGKILL. Nothing in the harness sends a third SIGKILL: its restart
condition can fire only twice and both had already fired at cycles 169 and 336.

The host's own stdout and stderr were kept in memory and emitted only on a
harness fatal error, which never fired, so the log that would name the cause was
lost. That is a harness defect, now fixed.

## Harness defects this exposed, both fixed

1. The host's output is now streamed to a file next to the report, so a silent
   death leaves evidence.
2. An unexpected socket close now triggers reconnection and a fresh `init`,
   with each reconnection counted and emitted. The previous version only
   reconnected after its own deliberate restarts, which is why it spent the last
   seven minutes talking to a dead socket.

A conclusive Stage 7 result needs a rerun with these in place. The rerun was not
started in this round.

## Gate status

**Not met.** The gate forbids an unrecoverable native connection, and one
occurred. Blank captions, stale captions after Stop, lost accepted sentences and
unbounded memory growth were all clean for the 53 minutes that were measured,
and both deliberate restarts recovered, so the failure is specifically an
unexplained process death plus the harness's inability to notice it.

## What is not established

- No browser capture, no VAD, no tab navigation, no extension reload. The
  handoff asks for those; they need Opera.
- Authored synthetic speech, one voice, no real livestream audio.
- The cause of the host death is unknown, so it is not classified as a product
  defect or an environment event.
- The final seven minutes produced no measurements at all.
