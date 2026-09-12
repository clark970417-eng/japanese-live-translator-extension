# LiveTranslate comparison

## Scope

The unmodified upstream source at `rioX432/live-translate`, commit
`3d333e6296240d17dfc72207eac7fd7a7499a663`, was built in an isolated checkout.
Its interface was opened with a separate application profile. No upstream GitHub
Release was listed at the time of inspection; this is a source-build comparison,
not evidence about a separately distributed commercial product.

Both pipelines were exercised with the same MLX Whisper Large v3 Turbo model,
HY-MT1.5 1.8B Q4_K_M translation weights, 16 kHz mono WAV, and growing audio windows
at 1.2, 2.8, 4.5, 6.5, 8.5 seconds, followed by finalization. Tests covered Japanese
to English and Chinese. Engines were warmed before measurements; repeated rounds
retained pipeline context. This harness bypasses capture, VAD, rendering, and
browser messaging, so it is not an end-to-end UI comparison.

## Observed differences

| Area | Upstream observation | Fork observation / action |
| --- | --- | --- |
| Startup dependencies | MLX audio decoding failed until FFmpeg was placed on the test PATH | Direct WAV decoding avoids that dependency for captured PCM |
| Interface | Audio source, level, interval, and expandable advanced controls were visible; Apple M5 was detected | Original desktop interface retained; extension has a compact control surface and settings entry |
| Interim source | Older translation responses could restore an older source hypothesis | Keep the latest source while attaching compatible translation results |
| Silence | A one-second silent PCM input produced “Thank you.” / “谢谢。” | Same silent input returned no caption |
| Speculative translation | Worker repeatedly logged “No sequences left” and fell back | Check capacity before speculation; do not force a previous incorrect response prefix |
| Stop lifecycle | Original subprocess cleanup logged a null-process error | Fork already captures the child process before asynchronous disposal; additional stale-work guards added |
| Chinese suitability | Simplified Chinese output, with context sometimes repeated ahead of the current source | Traditional Chinese output and source-only context; awkward wording still occurs |

## September 12: twenty-utterance comparison

On Apple M5 with 16 GB memory, both source builds replayed JSUT
BASIC5000_4501–4520 with Whisper Large v3 Turbo and HY-MT1.5 1.8B Q4_K_M.
The same growing-window schedule was used, one inference benchmark at a time.
These are previously used development inputs, not unseen or blinded evaluation.

| Engine-only measurement | Pinned upstream | Revised fork |
| --- | ---: | ---: |
| First Chinese, median | 6.04 s | 1.43 s |
| First Chinese, p95 | 22.20 s | 2.45 s |
| Final delay after speech end, median | 12.48 s | 1.40 s |
| Missing final outputs | 0 / 20 | 0 / 20 |
| Silent controls producing text | 2 / 2 | 0 / 2 |
| Punctuation-insensitive recognition character error | 8.17% | 8.17% |

The fork was faster in this run and did not hallucinate on the silent controls.
This does not establish translation-quality superiority: both still mistranslated
some words, and recognition error is not a translation score. The corpus has one
read-speech speaker and does not represent noisy, overlapping livestream speech.

Important conditions: the original Python bridge ignores the requested Japanese
setting and uses automatic language detection; the fork honors it. Its initial
warm-up and deterministic decoding also differ. The original requires FFmpeg,
which was supplied for the valid comparison. These are implementation differences,
not identical decoder configurations. The selected HY-MT1.5 path is not a benchmark
of every upstream engine or its automatic default selection. Machine load was not
held constant, and capture, VAD, browser messaging and rendering were bypassed.

Raw evidence: [upstream](tests/results/stage8-upstream-ready-matched.jsonl),
[fork](tests/results/stage8-fork-context-isolated.jsonl). Failed setup runs and
rejected experiments are described in [the revision report](RETEST-3.8.0.md).

## Historical awake A/B results

The comparison was repeated while awake on September 11, 2026. Values below are
elapsed seconds from the beginning of a 10.7223-second recording. Engines were
warmed; each implementation ran separately with the same audio and model weights.

| Measurement | Upstream round 1 / 2 | Fork round 1 / 2 |
| --- | --- | --- |
| First Japanese | 2.007 / 2.017 | 1.970 / 1.966 |
| First Chinese | 3.416 / 4.052 | 3.298 / 4.202 |
| Final translation | 12.306 / 12.329 | 12.551 / 11.851 |
| One second of silent PCM | Incorrect “Thank you.” / “谢谢。” | No caption |

Speed is effectively similar in this small comparison. Differences of a few
hundredths or tenths of a second do not establish a general performance advantage.
The fork's silence behavior was better in this test. Both translators expanded
some wording; neither is proven more accurate on a representative speech corpus.
The repeated second round retained context and is not an independent quality sample.

[Raw events](tests/results/livetranslate-3.7-awake.json) are retained for review.
Prior sleep-interrupted runs remain excluded. This still does not establish a
winner for the complete UI or every optional upstream feature.

Separately, the updated fork completed an Opera capture run: Japanese appeared at
1.77 seconds, Chinese at 2.97 seconds, and final translation at 13.92 seconds.
This browser measurement includes a different capture/scheduling path and must
not be ranked directly against the pipeline-only values above.

## Reproduction

`scripts/benchmark-pipeline.ts` in `desktop-app` runs the actual pipeline and engine
classes. Compile it into `out/main/benchmark-pipeline.cjs` after the normal app build
so worker and bridge paths resolve correctly. Run it with Electron and set:

- `COMPARE_PROFILE`: a separate test profile with the local GGUF model installed.
- `COMPARE_AUDIO`: a mono 16-bit PCM WAV at 16 kHz.
- `COMPARE_REPORT`: an output JSON path.
- `COMPARE_TARGET`: optional `en` or `zh`; default tests both.
- `COMPARE_ROUNDS`: optional repeat count; default two.

Keep the machine awake, run each implementation separately, retain raw events,
and exclude runs containing sleep. The harness does not request cloud inference.
Use diverse held-out speech, silence, music, and overlapping voices before making
quality or long-session claims. The current fixture alone is not representative.
