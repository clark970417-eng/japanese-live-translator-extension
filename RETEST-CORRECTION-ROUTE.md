# Prototype: small-model captions with optional large-model correction

Task: prototype a bounded Japanese-to-Traditional-Chinese route, HY-MT1.5 1.8B
for the immediate caption and optional Hy-MT2 7B final correction, with a strict
deadline, never blocking later speech, and never letting an older correction
overwrite a newer caption. Keep it out of production if latency or quality gates
fail.

**Verdict: out of production.** It fails the memory gate by a wide margin and the
quality gate on invented content. The latency comparison turned out to be
invalid and is reported as such, not as a pass. Nothing is wired into production.

## Gates, frozen before measurement

`tests/corpus/correction-route-gates.json`, SHA-256
`84845c2208408edf1da265fbeeac52616bfaf61190c6b35885beeaf6fb9bf5b6`, written and
hash-recorded before the route was run, and re-verified by hash immediately
before the run.

| Gate | Threshold |
| --- | --- |
| Immediate first Chinese | median ≤ 1.10× and p95 ≤ 1.20× the same-session small-model baseline |
| Immediate final delay | median ≤ 1.10× and p95 ≤ 1.20× baseline |
| Correction deadline | 2500 ms after the final caption |
| Corrections landing in time | ≥ 80% of those that differ from the immediate caption |
| Swap-out pages during the route | 0 |
| Lowest system free memory | ≥ 20% |
| Stale corrections published | 0 |
| Quality on the frozen holdout | ≥ +3 automated checks, and no correction may introduce a negation, speaker-intent or invented-content error |

## Prototype

`src/pipeline/correction-router.ts`, marked as a prototype and imported only by
its tests and the benchmark.

- `submit` returns without awaiting; the correction starts on a later tick.
- A timer aborts the correction at the deadline, and publication re-checks the
  signal, so a model that answers late is still refused.
- Only the newest finalized caption may be corrected. A newer submit aborts the
  older correction, and a correction finishing after a newer caption exists is
  discarded. The same rule is safe for single-caption and four-caption displays.
- An identical correction is not published; `stop` publishes nothing further;
  a failed correction is contained.

To keep the large model out of the caption worker's queue, the llama-based
translators now accept an optional `pool`. Production passes none and keeps the
single shared worker; the benchmark gives the 7B model its own `WorkerPool`.

## Tests

`src/pipeline/correction-router.test.ts`, seven deterministic tests: publishes a
differing correction in time; `submit` returns in under 5 ms without starting the
correction synchronously; aborts at the deadline and refuses a late answer from a
model that ignores the signal; an older correction that answers after a newer
caption is not published; identical corrections are not published; nothing is
published after `stop`; a failure is contained. Desktop suite 583 passed;
`tsc --build` clean.

## Measurement

`scripts/benchmark-correction-route.ts`, one process on this Mac:

- **Phase A**, small model only, JSUT BASIC5000_4501-4520.
- **Phase B**, the same replay with every final caption submitted to the router,
  7B in its own worker, loaded and warmed first (the route's best case).
- **Phase C**, the 34-item frozen holdout from `RETEST-ACCURACY.md` submitted one
  item at a time, with the Stage 3 small-model output as the immediate caption.

| Measured | Phase A, small only | Phase B, route | Gate |
| --- | ---: | ---: | --- |
| First Chinese, median | 1245 ms | 1330 ms | invalid, see below |
| First Chinese, p95 | 2048 ms | 2108 ms | invalid |
| Final delay, median | 865 ms | 497 ms | invalid |
| Final delay, p95 | 1175 ms | 1204 ms | invalid |
| Swap-out pages | 0 | 175,276 | **fail** (max 0) |
| Lowest free memory | 45% | 9% | **fail** (min 20%) |
| Corrections published | — | 18 | |
| Corrections past the deadline | — | 2 | |
| Share landing in time | — | 90% | pass |
| Stale corrections published | — | 0 | pass, see limits |

About 2.7 GB was swapped to disk during phase B. Speech corrections took 987 ms at
the median, 2503 ms at the p95 and 2559 ms at worst; the two over 2500 ms were
aborted and not shown.

### Why the latency rows are invalid

Phase B's final delay fell from 865 ms to 497 ms while a 7B model was generating
and the system was swapping. That is not speed. The pipeline keeps a 500-entry
translation cache keyed by source text, it was not cleared between phases, and
phase B replayed the same audio as phase A, so its translations came from cache.
The handoff states that cached phrases and repeated audio are regression controls,
not latency evidence. The latency gates are therefore recorded as **not measured
validly**, not as passed.

A clean rerun would need a different corpus in each phase or a cleared cache. It
was not done, because two independent gates had already failed and no latency
result could return the route to production.

### Quality on the frozen holdout

| Frozen holdout, 34 items | Immediate, 1.8B | After correction |
| --- | ---: | ---: |
| Automated checks passed | 23 | 31 |
| Corrections landing within 2500 ms | — | 34 of 34 |

All 34 corrected texts are byte-identical to the Stage 3 7B outputs, and no item
that passed before failed after. The eight fixed items are the ones Stage 3
already attributed to the 1.8B model, including the inverted casual sentence and
the cooldown and respawn terms.

Reading every correction found one error the checks did not catch, and it is the
kind the gate forbids:

```
source     もしこれで倒せなかったら、たぶん
immediate  如果這樣還是無法打倒對方，那麼大概……
corrected  如果用這個還打不倒的話，大概就沒辦法了。
```

The source trails off after "probably". The immediate caption kept it unfinished;
the correction invents a conclusion, "then there is probably no way". A second,
milder case closes a cut-off utterance: `呃，就是，剛才那個東西……` became
`呃，就是，剛才那個啊。`. The **quality gate fails** on invented content despite the
eight-item gain.

Phase C submitted items one at a time with no live captions running, so 34 of 34
landing in time does not describe speech; phase B's 90% does.

## Regressions

None in production: the router is not wired in, and the new `pool` option
defaults to the existing shared worker. Every existing test passes.

## Remaining limitations

- The stale-correction rule is proven by unit tests. In the measured replay
  finals were spaced far enough apart that no correction was superseded, so the
  0 published stale corrections was not exercised under contention.
- One corpus, one voice, one machine, one run.
- Memory is measured with the user's normal applications open, which is the
  condition the route would face, but those applications were not held constant.
- A shared-worker variant was not prototyped: every correction would swap
  models inside the caption worker's queue, which blocks later speech by
  construction and was measured at over 20 s per round trip in Stage 4.

Raw rows: `tests/results/correction-route.jsonl`.
