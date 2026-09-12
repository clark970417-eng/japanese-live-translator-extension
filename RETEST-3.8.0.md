# 3.8.0 revision evidence

This report records a major local-engine revision. It does not claim universal
superiority over LiveTranslate. The macOS application and Opera extension were
installed and checked; remaining acceptance gaps are listed below.

## Changes under verification

- A request keeps its translation model identity even when another feature uses
  a different model. Loading, translating, switching, and releasing are serialized.
- Failed initialization does not leak references. Late requests cannot revive a
  released engine. Queued requests are bounded.
- Final speech cancels obsolete interim inference, including the work in the
  inference process, rather than only hiding its eventual response.
- Completed translations are reused only for an exactly matching final source;
  adaptive quality routing still receives the final sentence.
- MLX short-audio decoding has a duration-dependent output budget. An implausible
  transcript is withheld until a later window; normal brief repeated reactions
  remain valid. Temporary audio filenames are unique across engines.
- Translation deadlines abort generation. A token-limited response is reported
  as incomplete instead of being displayed as a successful full translation.
- New Japanese draft events reach the extension. Only one draft recognition runs
  at once, and a late draft cannot overwrite a newer primary hypothesis.
- Browser capture authorization failure cleans up resources and gives a retry
  instruction instead of leaving the interface at model loading.
- Hy-MT2 7B is an optional offline setting. The smaller existing model is retained.

## Model evaluation

Hy-MT2 7B Q4_K_M was downloaded from Tencent's pinned repository revision
`ab8472660ac61fac25f1af43fac2599d52a8a775`. File size: 4,624,648,896 bytes.
SHA-256: `9f96256500f3fc1ab4d64336b58f52a949a95ad7516b0c229476eef782f9f77b`.
The weights are not committed to this repository.

The existing 31 development sentences were tested with HY-MT1.5 1.8B, Hy-MT2
1.8B, and Hy-MT2 7B. 7B corrected some personal-intent and omitted-meaning errors,
but still produced incorrect wording. Simplified and structured style-prompt
experiments introduced regressions and were rejected; their raw results remain.
No fine-tuning or blind human quality review was performed.

Three cached recognition models were tested on four authored synthetic sentences.
Whisper base was faster but misrecognized the schedule. Small also made an error;
large-v3-turbo retained the intended time. Base was not promoted as a replacement.
A base draft alongside turbo improved initial Japanese by about 250 ms on a
repeated fixture but did not improve initial Chinese, so it is not enabled by default.

## Natural speech and the reproduced stall

Twenty read-speech utterances from JSUT (BASIC5000_4501–4520) were frozen before
this round of corpus testing. This is one speaker reading general sentences,
not a representative multi-speaker livestream. The benchmark includes primary
recognition and translation but bypasses capture, VAD, and rendering. Later
passes repeat those same inputs and must not be called unseen speech.

The initial 7B run exposed a decoder loop: less than one second of audio produced
hundreds of repeated characters. That obsolete translation took about 55 seconds;
first Chinese for the utterance arrived at about 63 seconds. This failure is
retained in `tests/results/stage8-corpus7b-before.jsonl`. Short-window guards and
inference cancellation were added in response. Post-revision measurements and long-session results are documented below.

The user continued using the machine during testing. Device load is not held
constant; raw time differences cannot establish a small performance advantage.
Source-language settings, model, cache state, and measurement boundary must be
matched for paired comparisons.

## Dataset provenance

JSUT: Ryosuke Sonobe, Shinnosuke Takamichi, and Hiroshi Saruwatari,
“JSUT corpus: free large-scale Japanese speech corpus for end-to-end speech
synthesis,” 2017. [Original dataset and terms](https://sites.google.com/site/shinnosuketakamichi/publication/jsut).
The local test files came from the
[FluidInference mirror](https://huggingface.co/datasets/FluidInference/JSUT-basic5000)
at `cd13cc9c9fe70d8d4f62ffe6fbbb872aef79835c`.
Audio is used locally for personal evaluation and is not redistributed here.
Reference text and derived annotations retain the source text license;
see the [dataset license](https://huggingface.co/datasets/FluidInference/JSUT-basic5000/blob/main/LICENCE.txt).

## Resumed verification on September 12

The earlier temporary soak report was no longer available after the interrupted
session; it is not counted as a completed long-session check. New reports are
saved in the repository's results directory.

- Type checking and production build passed; 523 desktop tests passed before the browser scheduling follow-up.
- All 58 extension tests passed after the startup-status follow-up.
- Isolated desktop UI: 13 passed, 1 audio-start test explicitly skipped. This does
  not verify Opera audio authorization or end-to-end captions.
- A connected extension now reads the current text-translation model setting for
  each request. A regression test switches models without reconnecting.
- The repeated 31-case Hy-MT2 7B probe completed without empty responses. Median
  translation-only time was 2,624 ms. The output still incorrectly treats REC as
  a person and changes an intended departure into a negative construction.
  Raw evidence: `tests/results/stage8-7b-current.json`. This is not a blind or
  unseen quality evaluation and does not establish superiority over upstream.

### Newly reproduced failures and rejected changes

The 20-utterance 7B run completed with no missing final strings and two silent
controls, but this does not imply usable speed or correct meaning. Initial
Chinese median was 3.62 s, p95 30.19 s; final delay median was 9.59 s. Recognition
had a 30-second timeout. The bridge now restarts after a timeout and a lifecycle
guard prevents restart after a user stop; two regression tests cover these cases.

An experiment retaining the inference context after an intentional cancellation
failed: the second utterance received content from an earlier sentence, and the
fifth final hit the output budget. That experiment was reverted, its report is
`tests/results/stage8-context-reuse-rejected.jsonl`. A restored-path comparison
is required before attributing the failure exclusively to context reuse.

The first resumed upstream run failed because its required ffmpeg dependency
was absent. This was an evaluation setup failure, not evidence that the fork has
better recognition or latency. The raw failure is retained. ffmpeg was restored
in the isolated environment before the successful upstream comparison.

The restored cache-disposal path reproduced the same cross-sentence content.
Therefore context reuse alone was not the cause. The translation prompt prepended
previous utterances; HY-MT1.5 translated that reference history instead of the
current input. HY-MT1.5 and Hy-MT2 now receive terminology but no previous-utterance
text. Other model families retain their existing context policy. The original
input context is not mutated. The matched rerun is
`tests/results/stage8-fork-context-isolated.jsonl`.

### Alternative stateful recognition probe

`mlx-qwen3-asr` 0.4.0 with Qwen3-ASR-0.6B was tested in a separate Python
environment; it was not installed as the production recognizer. Model revision:
`5eb144179a02acc5e5ba31e748d22b0cf3e303b0`.
Twenty identical read-speech samples were fed as incremental PCM chunks.
One-second chunks gave 49.43% punctuation-insensitive character error; two-second
chunks gave 32.13%, compared with 8.17% for the current Whisper path on this set.
These candidate configurations were rejected. The metric counts orthographic
differences and is not a general multilingual score. Local model paths were
redacted from published report headers; numerical measurements are unchanged.

The new source passes 523 desktop tests. Packaging now includes only built runtime
files and production dependencies, excluding local test profiles, corpora and
weights. The first packaging attempt caught the oversized local test model and
failed before installation; the installed application was unaffected.


## Browser findings and final follow-up

The installed 3.8.0 application and the unpacked Opera extension were both
updated on September 12. Opera's extension manager and popup displayed 3.8.0.
The signed installed application's native Whisper addon loaded successfully
from its installed location. Packaging no longer depends on a developer's
absolute dylib paths; the addon resolves its dependencies via `@loader_path`.
Local test profiles and model weights are excluded from the application archive.

A genuine YouTube tab (video `BNybJ5Kttzs`, with no native closed captions)
was started through the toolbar popup. The UI reported incoming audio, 99%
speech probability, and the native MLX Whisper + HY-MT1.5 path. Japanese and
Chinese captions were visible and changed to subsequent utterances. Stopping
returned to the idle state. This is an integration smoke test, not a timing or
translation-quality benchmark: another inference soak was running concurrently.
The recording queue reached ten segments under that concurrent load.

The smoke test reproduced misleading startup feedback: while the desktop model
was still initializing, the popup's periodic refresh overwrote the loading
message with "ready." The health response now includes the pending control
operation; loading/stopping remain visible and duplicate control clicks are
blocked. A regression test covers pre-capture model loading and failure states.

Code inspection after the browser test found that page text and audio shared a
single FIFO. The companion now reserves request capacity for audio/control and
prioritizes queued audio while processing one text job after at most four
priority jobs. Model access stays serial. Excess page text receives a retryable
error instead of disconnecting the capture socket. Tests use a blocked text
inference and a flood of requests to verify that audio survives and runs next,
then confirm subsequent text requests still succeed. The final scheduler package passed runtime/archive verification and was installed.
A subsequent Opera check confirmed model loading, audio, changing bilingual
captions, four-group turnover, and return to idle after Stop.

## Additional prompt experiment

A separate direct-model probe compared the current Japanese-to-Chinese prompt
with Tencent's shorter documented template, at temperature zero on the same
small model. Both reference text and the recognizer's actual output were used.
The shorter prompt did not fix the summer-bedding error and still omitted the
meaning of downhill. It improved some individual phrases but did not demonstrate
a consistent quality improvement, so it was not adopted. Raw reports are
`stage8-prompt-official-ab.jsonl` and `stage8-prompt-recognized-ab.jsonl`.
This development probe uses its own context and concurrent system load; its
translation times are not production-pipeline latency measurements.

The 60-minute soak is a stability stress run, not the matched latency comparison.
Intervals with concurrent prompt inference and browser capture are recorded in
`stage8-soak-load-events.jsonl`. The workload includes the user's normal computer
use. Process working-set samples do not measure all Metal allocations and cannot
by themselves prove an absence of memory leaks. Short paired measurements above
must not be substituted for worst-case latency under load.


A Chinese-to-Japanese viewer-grammar candidate fixed one gratitude viewpoint
error but introduced awkward requests and an ungrammatical curiosity sentence.
It was rejected rather than replacing the current prompt. The retained report is
`stage8-viewer-grammar-candidate.jsonl`, reproducible with
`desktop-app/scripts/benchmark-viewer-style.mjs`. The YouTube typed smoke test
also exposed an existing viewer/addressee shift. Drafts still require review.

After the companion scheduler and UI follow-up, all 526 desktop tests across
51 files, type checking, and all 58 extension tests passed. These counts do not
measure translation fidelity.


The shorter conditional gratitude hint was also rejected: the small model still
changed the addressee's action into the viewer's experience in the browser-derived
sentence. `stage8-gratitude-candidate.jsonl` preserves the failure. These probes
show that wording changes alone do not solve all perspective errors.

YouTube Shorts (`7rr4wxzKy9Q`) exposed the Chinese-to-Japanese composer control.
The test input "太可愛了！" became "とても可愛いです！". Both the regular YouTube
and Shorts test drafts were cleared without posting. This confirms those editor
integration paths, not broad translation quality.


### Final package verification

The alternate-output build initially used a relative output path and misplaced
the renderer directory. Its isolated UI run failed and was stopped; that package
was not installed. Rebuilding to an absolute output directory restored the
renderer. The new build passed 13 isolated UI checks (audio-start still skipped).
`scripts/verify-mac-package.cjs` now verifies archive/runtime byte identity,
renderer asset presence, version, signed bundle integrity and native loader
portability before installation. It also rejects test directories and GGUF
weights inside the archive. The final package passed these checks.

Opera reloaded the updated extension files and displayed version 3.8.0. Its
settings showed both single-pair and four-pair modes, matching font controls,
caption opacity and shared background opacity. The user's four-pair selection
was preserved. This setting inspection does not test every drag/resize gesture.


## Completed one-hour stress run

`stage8-soak-60m.jsonl` completed 329 sequential replay trials in 60.02 minutes,
with 32 silent controls and 32 pipeline restarts. No empty final string, silent
output, or fatal/error event was recorded. The same 20 development utterances
were repeated; this is not diverse unseen livestream validation.

| Engine-only stress metric | Median | p95 | Maximum |
| --- | ---: | ---: | ---: |
| First Japanese | 1.626 s | 3.856 s | 28.001 s |
| First Chinese | 2.280 s | 7.691 s | 28.657 s |
| Final delay after speech end | 3.885 s | 12.334 s | 84.503 s |

The long tail is a failed latency target, despite successful completion. Several
intervals included other model probes, browser capture, builds and normal user
work. The replay driver processes growing windows sequentially, so overloaded
work can compound rather than skipping to the latest window. These values must
not be presented as isolated browser latency or as evidence of a universal win.
The scheduler/UI follow-up does not change this engine replay path.

### Actual browser follow-up

The updated installed app produced successive Japanese/Chinese pairs on the
uncaptioned YouTube recording while automatic chat translation was enabled.
Four newer groups replaced earlier groups. The Stop control returned to idle.
During overlap with the stress run, the popup reported a 3.124 s median and
4.122 s p95 per-request processing time, with queue median 2.801 s and p95
6.981 s. These are diagnostic snapshots, not an onset-timed controlled study.
The former label "recognition" was misleading: desktop requests include
translation. It now says processing and explicitly notes that inclusion.

Chat testing exposed standalone cheers translated literally or as negation.
Exact whole-message spellings of Nice, encouragement and "so close" now use
a small reviewed phrase table. A batch of 40 supported chat requests made zero
native-model or network calls in the integration test. Negations, questions
and longer clauses still pass through normally. This reduces a specific source
of competing inference and fixes those phrases, not arbitrary mistranslations.
The extension suite now passes 60 tests.


### Opera after the competing soak ended

A further approximately three-minute capture of the same recording was run with
chat translation enabled and no other inference benchmark. At 2,741 audio blocks,
the popup reported per-request processing median 726 ms and p95 1,216 ms, queue
median 0 ms and p95 500 ms, and first completed request median 1,554 ms and p95
2,820 ms. The latest Chinese followed its audio window end by 1,484 ms. There
were zero queued jobs, skipped expired audio, rejected results or resynchronizations
at that snapshot. Raw transcribed diagnostics are in `stage8-opera-solo.json`.
These are separate diagnostic distributions, not an average onset-to-Chinese
latency and not a randomized before/after comparison. Normal user applications
were left open. Full semantic accuracy and maximum browser latency remain unproven.

The actual chat replay now displayed "ないすー" as "漂亮！", "次こそ" as
"下次一定！", and encouragement as "加油！" after the final extension reload.

## Remaining gaps

- Generic translations still make perspective, negation, terminology and
  recognition-related mistakes. The optional 7B model is not a blanket fix.
- The complete diverse, blind quality evaluation and matched browser-to-upstream
  comparison are not complete.
- Windows, every optional upstream engine, and the entire X/appearance interaction
  matrix were not retested in this revision.
- High-load tail latency failed the desired target. The isolated Opera smoke
  does not remove or invalidate that failure.

This is a verified macOS/Opera improvement, not a claim of full replacement
quality across all LiveTranslate use cases.

At Stop, the final 2,999-block snapshot reported processing median 764 ms and
p95 1,238 ms (latest request 2,255 ms), queue median 0 ms and p95 500 ms. The
UI returned to idle with Start enabled and Stop disabled; the dedicated test
video window was then closed.
