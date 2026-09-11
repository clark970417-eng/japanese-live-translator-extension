# Streaming confirmation regression

The confirmation path could translate a shorter clause after the full hypothesis
had already been translated. A deterministic test reproduced two requests for
the same unchanged Japanese hypothesis, with the second response replacing the
complete Chinese sentence with an incomplete phrase.

The processor now skips that shorter clause if an existing translation covers it
and its source still matches the current hypothesis. Revised hypotheses remain
eligible for translation. This is a scheduling fix, not a translation-model fix.

Validation: 500 tests across 46 files passed; TypeScript checking and production
build passed. The new regression test failed on the original implementation.

Two warmed production-engine fixture runs completed in an isolated profile with
two stop/restart cycles and three empty silent controls. No pipeline error or
fatal event was recorded. First Chinese arrived at 1.676 and 1.785 seconds from
fixture onset; final Chinese arrived at 11.855 and 11.789 seconds for 10.7223
seconds of audio. These are repeated synthetic-fixture, engine-only checks and
cannot establish improvement over previous runs under different machine load.
They bypass browser capture, VAD and rendering. Final translation still adds a
redundant expression of thanks, so fidelity is not fully resolved.

[Raw events](tests/results/stage7-clause-regression.json).
## 3.7.5 follow-up

Normal Japanese clause translation now uses sentence punctuation instead of case
particles. Dedicated SimulMT retains its original particle boundaries. The full
interim-hypothesis path remains active, so this does not eliminate hallucinations
in incomplete hypotheses.

503 desktop tests, 56 extension tests, TypeScript checking and production build
passed. Six warmed repeated-fixture runs completed in 99.624 seconds with three
restarts and four empty silent controls, and no pipeline errors. First Chinese
ranged from 1.655 to 1.850 seconds (median 1.7625); final response ranged from
11.292 to 12.193 seconds. Translation still includes redundant thanks. These
numbers do not constitute a matched upstream comparison or a long-duration test.

[Six-round raw events](tests/results/stage7-sentence-boundary.json).

Desktop 3.7.5 was packaged, installed and relaunched. Packaged and installed
app.asar SHA-256 matched:
`3dc0fab31f1777289009b8e71c0d4df48ce1991c36aa7fe66fb84058d3d77565`.
Opera extension files were updated to 3.7.5. Runtime reload and installed browser
capture verification remain pending: foreground window changes interrupted the
maintenance-page interaction. Do not treat file copying as verified activation.
