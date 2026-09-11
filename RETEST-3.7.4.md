# Translation and restart follow-up — desktop 3.7.4

This is a targeted follow-up, not evidence of universal superiority over LiveTranslate.
The browser extension remains 3.7.4; its installed controls use the updated desktop engine.

## Changes

- HY-MT1.5 translation sessions no longer receive node-llama-cpp's implicit generic
  assistant system prompt. The user-only history is cleared on creation, reuse,
  warm-up completion, and speculative retranslation. Other model families retain
  their configured system instructions. This follows the
  [official model's prompt guidance](https://huggingface.co/tencent/HY-MT1.5-1.8B).
- Quantized V-cache now requests the flash-attention mode it requires. Previously
  creation failed with `V cache quantization requires flash_attn`, then retried
  without quantization. The existing unquantized fallback remains available.
- Chinese-to-Japanese prompts include relevant terminology and distinguish future
  inability from past inability. They request warm, respectful viewer wording
  without forcing every sentence into the same formal ending. User glossary
  entries take precedence over the built-in terminology.
- Python discovery checks module metadata instead of importing the complete MLX
  stack before each bridge startup. The bridge still loads and validates its
  dependencies during initialization. A discovery timeout is no longer reported
  as a missing installation.

## Why the restart correction was necessary

The first six-round engine run produced six final Chinese captions, but the third
restart failed with `mlx-whisper not found`. The five-second discovery probe had
performed a full MLX import and discarded timeout details. This run **failed** and
is retained in [the raw report](tests/results/stage6-restart-failure.json).
It must not be counted as a successful soak test.

## Text quality and rejected candidates

The [31-case baseline](tests/results/stage6-text-baseline.json) and
[candidate](tests/results/stage6-text-candidate.json) use actual local inference,
not mocked translations. The expanded set includes additional personal plans,
negation, scheduling, and numeric corrections. Examples of improvements include
`歌聲` retaining the meaning of singing voice, `辛苦了` becoming an appropriate
acknowledgement, and the tested departure message using a polite negative ending.

These are authored spot checks reviewed in this task, not a blind accuracy score.
The source examples were visible during prompt development. Remaining errors
include a personal bedtime plan being rendered as an invitation and an informal
rest wish being rendered in the past tense by the raw model. Existing exact-match
reviewed phrases cover some short messages in the extension; they do not establish
correctness for arbitrary variants or the raw desktop engine. Chinese wording can
still be literal, and the full audio fixture added a redundant thank-you.

The [larger Q8 model](tests/results/stage6-q8-rejected.json) improved some wording
but did not reliably solve speaker perspective. It was not made the default, and
its temporary download was removed. A [minimal prompt](tests/results/stage6-minimal-rejected.json)
reversed a negative request; [sampling changes](tests/results/stage6-sampling-rejected.json)
also failed to give consistent quality. Neither is shipped. The recorded Q8 run
used the earlier term-guided prompt and 23 cases, so it is not a controlled comparison
against every aspect of the final 31-case candidate.

## Timing scope

Under the host's changing workload, the initial six-round candidate produced first
Chinese in 1.843–4.294 seconds. Final translation tail after the finalize request
was 1.645–6.469 seconds. The unquantized control's two rounds gave first Chinese
in 3.501/3.617 seconds and final tails of 6.476/1.848 seconds; see
[raw control](tests/results/stage6-unquantized-comparison.json).
These runs do not establish a universal speedup or isolate other host workload.
They bypass browser capture and VAD, and repeat a synthetic Japanese fixture.

The earlier 31.8-minute test remains evidence for the earlier build only. It does
not replace retesting this change, and none of these results guarantee zero delay
or correctness on hours-long broadcasts.

## Corrective retest and lifecycle ordering

After metadata-only Python discovery, six audio rounds and six stop/restarts
completed, with seven silent probes returning no caption text and no pipeline
fatal/error events. [Raw run](tests/results/stage6-discovery-fixed.json).
This run exposed a separate non-fatal shutdown race in the worker log: disposal
could release the context while prefix warm-up was still running. Initialization
now waits for warm-up before reporting ready, and lifecycle messages share the
inference queue. The final lifecycle retest is recorded below.

The final worker-ordering run completed three audio rounds, three stop/restarts,
and four empty silent probes in 87.418 seconds. There were no pipeline error/fatal
events and no disposed-context warm-up error at shutdown.
[Final lifecycle run](tests/results/stage6-lifecycle-final.json).
This is a short corrective regression run, not another 31-minute soak.

Validation: 499 desktop tests, 56 extension tests, TypeScript, and the production
build pass. The Python metadata-probe regression uses a real temporary Python
module that raises if imported: metadata lookup succeeds and the old full-import
probe fails. No paid provider, external chat account, or model fine-tuning was used.

## Installed verification

The installed desktop bundle reports 3.7.4. Its `app.asar` matches the packaged
archive (SHA-256 `7489023faebfc841ee61022e8b5ec32be126069bb5b9e5479f508aeba453d783`).
The existing browser extension remains 3.7.4 and was reloaded through its own
explicit maintenance page; the popup visibly reports v3.7.4. Core installed
extension files match the repository.

The installed Opera text-only test returned
`今日は最後を見ることができません。明日また見に来ます！` and left voice capture
off. This first request took 9,493 ms including cold startup; it is not evidence
of a fast cold start. No message was posted. The maintenance page is test-only
and reloads this extension, never other installed extensions.

Installed Opera audio checks exercised actual tab capture in both modes. Recording
mode showed Japanese at 3.09 s and Chinese at 5.82 s; its final Chinese appeared at
22.17 s. Realtime mode showed Japanese at 3.28 s and Chinese at 3.58 s, updated
11 times, then cleared captions within 121 ms of their expiry deadline. Both
stopped capture. Each used one fixture cycle, so these checks do not revalidate
four-group rotation. The second run reused the same audio and can benefit from
caching. [Visible-result summary](tests/results/stage6-opera-installed.json).

The realtime interim recognition incorrectly included a person's name, and the
translation expanded it into an invented hosting context before later correction.
This remains unresolved. The installed runs verify functionality and cleanup,
**not** the requested low-latency/accuracy target; the observed delay is still too
high to describe as equivalent to a polished commercial application.
