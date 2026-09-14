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

## September 13: feature behavior, compared separately from performance

Upstream is the pinned revision `3d333e6`, which a fetch on September 12
confirmed is still the tip of `rioX432/live-translate` main. A whole-tree diff
shows **no file exists upstream that is absent from the fork**: the fork is a
superset, with 45 modified files. Nothing below is a missing-source gap.

The comparison that matters for behavior is what each build can actually do
through the browser, because the fork's native companion exposes exactly five
operations: `settings`, `stop`, `init`, `decode` and `translate`.

| Capability | Upstream desktop | Fork through the browser | Verdict |
| --- | --- | --- | --- |
| Bilingual captions over browser tab audio | not offered | native companion plus overlay | fork only |
| Traditional Chinese output | Simplified in the observed run | Traditional | fork, for this user's task |
| Requested source language honored | the Python bridge ignores it and auto-detects | honored, with `auto` still available | fork |
| Website text translation, YouTube and X | not offered | titles, chat, comments, X posts | fork only |
| Japanese reply drafts from Chinese | not offered | composer drafts, never submitted | fork only |
| Non-speech audio | shares the same dead `no_speech_prob` guard; not yet re-measured | stock outro rejected as of this round | fork, pending an upstream re-run |
| Arbitrary audio file formats | FFmpeg decoding | 16 kHz PCM only | upstream |
| Release and auto-update channel | published channel | no release published | upstream |
| Live controls exposed in the interface | audio source, level meter, streaming interval, advanced panel | compact popup plus a desktop settings button | upstream |
| Engine breadth reachable end to end | every engine including cloud realtime | local cascade only | upstream |
| Speaker labels | desktop overlay | forwarded by the companion, unused by the extension | upstream |
| TTS, virtual microphone, accessibility overlay, global shortcuts | present | not bridged | upstream, and out of scope by the handoff |

Cloud realtime, TTS, virtual microphone, accessibility parity, FFmpeg format
support and release publishing are all listed as non-goals in
`CLAUDE-HANDOFF.md`. They are recorded here as honest gaps, not as a backlog.

## What this round changed, and what it does not yet claim

The latency and recognition numbers earlier in this file were measured before
the changes in `RETEST-CONTENTION.md`, `RETEST-CONTINUITY.md`,
`RETEST-ACCURACY.md` and `RETEST-DRAFTS.md`. They are **not** restated as
current. A matched fork-versus-upstream rerun on the same corpus is required
before any performance verdict in this section is updated, and it must run while
nothing else holds the inference worker.

No category above is claimed as a general win. "Fork only" means upstream does
not offer the capability at all, not that the fork's implementation is good.

## Reproduction of this round's harnesses

All of these live in `desktop-app` and are compiled with esbuild to
`out/main/<name>.cjs` before being run with the local Electron binary. A normal
`npm run build` empties `out/main`, so recompile the benchmarks after building
the app. Run one at a time; every measurement in these reports is invalid if two
inference jobs overlap.

| Harness | Purpose | Report |
| --- | --- | --- |
| `scripts/benchmark-draft-contention.ts` | audio versus written draft on the shared worker | `tests/results/contention-matched.jsonl` |
| `scripts/verify-companion-host.ts` plus `scripts/verify-installed-contention.mjs` | the real companion over its socket protocol | `tests/results/companion-path-*.jsonl` |
| `scripts/generate-continuity-corpus.py` with `--manifest` | authored condition clips | `tests/corpus/continuity.json`, `tests/corpus/soak.json` |
| `scripts/benchmark-continuity.ts` | recognition continuity per condition | `tests/results/continuity-*.jsonl` |
| `scripts/benchmark-holdout.ts` | Japanese to Chinese accuracy on a frozen set | `tests/results/holdout-*.jsonl` |
| `scripts/benchmark-draft-review.ts` | Chinese to Japanese drafts on a frozen set | `tests/results/draft-review-*.jsonl` |
| `scripts/soak-companion.mjs` | long session, restarts and recovery | `tests/results/soak-*.jsonl` |

Shared environment variables are `COMPARE_PROFILE` (a test profile holding the
GGUF weights), `COMPARE_REPORT`, and per-harness manifest and audio directories.
`COMPARE_TRANSLATOR=hunyuan-mt-2` selects the 7B quality model,
`COMPARE_GLOSSARY` switches terminology on or off.

The upstream side is built in `desktop-app/.test-out/upstream`, which is
byte-identical to `live-translate-upstream` and has its own `node_modules` and
FFmpeg. Its corpus replay is `out/main/benchmark-corpus.cjs`.

## September 13: matched rerun at fork 3.8.6

Both builds replayed JSUT BASIC5000_4501-4520 on the same Mac, in sequence,
never overlapping, with the same MLX Whisper large-v3-turbo and the same
HY-MT1.5 1.8B Q4_K_M weights from one shared test profile, the same growing
window schedule, the same manifest hash
`ba815629f913325b1e788e7e9b9f150d5980aac2c09a94c2f0090c9075d77219`, and the
same measurement boundary. Upstream is the pinned `3d333e6` build in
`desktop-app/.test-out/upstream`, with its own `node_modules` and its own
FFmpeg on PATH. Capture, VAD, rendering and browser messaging are bypassed on
both sides, so these are engine-and-pipeline numbers.

| Engine-only measurement | Fork 3.8.6 | Upstream 3d333e6 |
| --- | ---: | ---: |
| First Japanese, median | 1161 ms | 1533 ms |
| First Japanese, p95 | 1971 ms | 7492 ms |
| First Japanese, max | 1988 ms | 9737 ms |
| First Chinese, median | 1235 ms | 3480 ms |
| First Chinese, p95 | 2072 ms | 8937 ms |
| First Chinese, max | 2094 ms | 11771 ms |
| Final delay after speech end, median | 835 ms | 1646 ms |
| Final delay, p95 | 1157 ms | 7486 ms |
| Final delay, max | 1518 ms | 10700 ms |
| Missing final outputs | 0 / 20 | 0 / 20 |
| Silence controls producing text | 0 / 2 | 2 / 2 |
| Recognition character error, punctuation-insensitive | 8.17% | 8.17% |
| Peak resident memory across processes | 1445 MB | 1476 MB |

Raw rows: [fork](tests/results/stage8-fork-386.jsonl) and
[upstream](tests/results/stage8-upstream-386match.jsonl). Recognition error was
scored with `desktop-app/scripts/score-recognition.py`; both sides produced
exactly 43 edits over 526 reference characters, which is what identical weights
on identical audio should produce.

### Verdict by category

**Latency: fork, and the tail is where it matters.** The medians differ by a
factor of under three, but the p95 differs by more than four times on first
Chinese and more than six times on final delay. Upstream's slowest utterance
waited 11.8 seconds for Chinese against the fork's 2.1 seconds. This is one
read-speech corpus on one machine, so it is not a claim about every engine,
every utterance length, or noisy livestream audio.

**Recognition: tie, exactly.** Identical CER. Neither build has any recognition
advantage on this corpus, and nothing in this round changed recognition quality.

**Non-speech audio: fork.** Upstream produced text for both silent controls; the
fork produced none. The reason is in the source, not in luck: the amplitude gate
and the `no_speech_prob` check in `resources/mlx-whisper-bridge.py` are both
fork additions, absent from upstream, and `isOutroArtifact` in
`MlxWhisperEngine.ts` is a fork addition from this round. Upstream has no filter
on the MLX path at all.

**Memory: tie.** 1445 MB against 1476 MB peak is within run-to-run variation on
a 16 GB machine, and neither grew across 20 trials.

**Translation quality: not established.** Both sides load the same weights, but
the fork changed the prompt and uses deterministic decoding, so outputs can
differ. This corpus carries Japanese references for recognition and no Chinese
references, so nothing here scores translation. The fork's own frozen holdout in
`RETEST-ACCURACY.md` measures the fork's translator only, and it records six
genuine failures that remain.

**Recovery and long sessions: not comparable.** `RETEST-SOAK.md` soaked the fork
for 60 minutes and found 53 healthy minutes followed by an unexplained host
death. Upstream was not soaked, so no comparison exists.

**Features: see the September 13 behavior table above.** Five capabilities exist
only in the fork, five areas remain better upstream, and six of those are
explicit non-goals in the handoff.

No universal claim is made. The fork is faster on this corpus, equal on
recognition, better on non-speech audio, and unproven on translation quality and
long-session stability.

## September 14: 3.9.3 follow-up

The latest sequential replay again favors the fork on 19 paired trials with
valid timing: first Chinese median/p95 was 1245/2103 ms against upstream
3917/10725 ms, and final delay was 850/1587 ms against 8115/11436 ms. Both
recognition transcripts remain at 8.17% CER. The twentieth upstream latency row
is excluded because its monotonic clock jumped by about sixteen minutes during
one short file. Full conditions, raw paths and the recovery run are documented
in [RETEST-3.9.3.md](RETEST-3.9.3.md).

The older feature table above is historical. Versions 3.9.0–3.9.2 subsequently
added file import with bundled FFmpeg fallback, speaker labels, TTS, CoreAudio
virtual-microphone routing, global shortcuts, additional engine settings and a
GitHub update channel. These features are available in the desktop application;
the compact Opera popup intentionally exposes the controls needed for browser
captions and page translation.
