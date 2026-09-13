# Stage 7 evidence: long session and recovery

A first run reached 53 of 60 minutes in good health and then the companion host
process died without a crash report. A rerun with the harness fixed completed
all 60 minutes cleanly and did not reproduce the death. Both runs are recorded
below; the unexplained death is not written off.

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

Both fixes were in place for the rerun below.

## Second run, with the harness fixed

The rerun completed all 60 minutes. The host's output was streamed to
`tests/results/soak-60m-rerun-host.log`, and an unexpected close would have
triggered reconnection; neither was needed.

| Measurement | Run 1, first 53 min | Run 2, full 60 min |
| --- | ---: | ---: |
| Utterances replayed | 537 | 477 |
| Typed drafts during captions | 141 | 159 |
| Stop then Start cycles | 84 | 95 |
| Queue age, median | 731 ms | 727 ms |
| Queue age, p95 | 1947 ms | 2467 ms |
| Queue age, max | 5275 ms | 4284 ms |
| Final delay, median | 1931 ms | 2356 ms |
| Final delay, p95 | 4078 ms | 4847 ms |
| Final delay, max | 7998 ms | 7330 ms |
| Blank captions | 0 | 0 |
| Missing final captions | 0 | 0 |
| Stale captions after Stop | 0 | 0 |
| Request errors | none before the death | 0 |
| Unexpected disconnects | 1, unrecoverable | 0 |

Memory oscillated without a trend: 1717 MB at the start, then 1939, 1556, 1807
and 1513 MB at the quarter points. Both deliberate restarts recovered, at cycles
175 and 339. Every host exit in the log is a SIGKILL this harness sent: two
restarts and the final cleanup. The only error text in an hour of host output is
`ggml_metal_library_init_from_source: error compiling source`, printed once per
host start in both runs, including the runs where every translation succeeded.

45 of 477 cycles had a queue age above 3 seconds, and unlike run 1 they do not
escalate toward the end: the last 20 cycles peaked at 2723 ms queue age and
4617 ms final delay.

**The 53-minute death did not reproduce.** One occurrence in two runs, with the
logging that would have named it now in place and nothing to catch. It is
recorded as unexplained and unreproduced, not as a fixed defect and not as an
environment event.

One observation the fixed metric surfaced: 1010 emissions across 477 utterances
repeated a caption that already had the same Japanese *and* the same Chinese.
**Correction:** that metric compared captions across all decode windows of an
utterance, and each window is its own segment, so legitimate window-to-window
carry-over was counted. `RETEST-CAPTION-REPEATS.md` measures the redundant subset,
repeats within the same segment, and removes it.

## Gate status

**Met for the path this harness covers, with one recorded unknown.** Across the
full 60-minute rerun there was no blank caption, no lost accepted sentence, no
stale caption after Stop, no unbounded queue or memory growth, and no
unrecoverable native connection; both process restarts recovered and the p95 and
maximum values are reported above rather than hidden behind medians.

Two things keep this from being the whole gate. The unexplained death in run 1
is still unexplained. And a stuck "listening" state is a capture and VAD
symptom that cannot occur on this path at all, because the harness feeds PCM
directly; that half needs an installed Opera session, along with tab navigation
and extension reload.

## What is not established

- No browser capture, no VAD, no tab navigation, no extension reload. The
  handoff asks for those; they need Opera.
- Authored synthetic speech, one voice, no real livestream audio.
- Run 1's host death is unknown after a clean rerun, so it is classified as
  neither a product defect nor an environment event. Its final seven minutes
  produced no measurements at all.
- Two runs is not a stability sample; a failure seen once in two hours could
  recur outside them.
