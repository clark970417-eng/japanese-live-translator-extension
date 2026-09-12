# 3.8.1: accepted speech, preview scheduling, and measured concurrency

Status: the broader performance and translation-quality overhaul remains in progress. This revision does not establish universal superiority over LiveTranslate.

## Changes

- Desktop recording keeps the latest waiting interim audio window. Previously, a busy decoder discarded interim windows and waited for a later VAD update, even after becoming idle. Accepted final windows retain priority; one interim window cannot displace them.
- Final recognition and final translation now have separate completion stages. Accepted final translations preserve sentence order and retain their own source text, language, and speaker snapshot. Silence between utterances does not cancel accepted work; resetting the session does.
- The popup version is read from the installed manifest, eliminating stale hard-coded version labels.
- The companion correlates delayed Chinese with the original segment, waits for accepted translations before acknowledging Stop, and bounds pending final translations. Pending acknowledgements cannot prematurely close a browser caption row.
- Concurrent final recognition/translation is restricted to supported network translators. Local GPU engines retain serial requests because the candidate's measured Chinese latency regressed. Network scheduling has regression coverage; no claim of improved real API latency is made.

## Rejected local concurrency experiment

The same 20 JSUT recordings were supplied as completed segments 300 ms apart, deliberately faster than the engine could process them. This is a burst/backlog test, not microphone-to-subtitle latency. It bypasses capture, VAD, and the browser. Models: MLX Whisper large-v3-turbo and HY-MT1.5-1.8B, Japanese forced, Traditional Chinese output. Models were warmed; this development corpus has been used before. Runs were sequential on the user's working computer, not randomized or thermally controlled.

| Mode | Median recognition work | Median source delay from scheduled arrival | Median final Chinese delay from scheduled arrival | Total drain time |
| --- | ---: | ---: | ---: | ---: |
| Serial final requests | 421 ms | 5,344 ms | 5,708 ms | 15.56 s |
| Four accepted finals overlapping | 683 ms | 4,293 ms | 6,670 ms | 15.98 s |
| Two accepted finals overlapping | 701 ms | 6,248 ms | 7,256 ms | 17.42 s |

Each run completed all 20 translations with no missing final output or silent-control caption. The serial and four-final runs produced identical source/translation strings. Earlier Japanese in one run did not compensate for slower Chinese. Local final overlap was therefore rejected as the default; the results are not presented as a speedup.

Raw reports: [serial](tests/results/stage9-serial-burst.jsonl), [four-final overlap](tests/results/stage9-overlap-burst.jsonl), [two-final overlap](tests/results/stage9-overlap-two-burst.jsonl). The repeatable harness is `desktop-app/scripts/benchmark-overlap.ts`; `COMPARE_MODE=serial` waits for each translation, while `COMPARE_MODE=overlap` releases recognition first. `COMPARE_PENDING` bounds accepted completions. Standard corpus/profile/report environment variables match the existing corpus harness. Audio remains local and is not redistributed.

## Verification

- Desktop: 530 tests passed; TypeScript check passed.
- Extension: 63 tests passed, including the actual offscreen controller starting a queued preview immediately after busy work completes, without another VAD event.
- Isolated desktop UI: 13 passed, 1 audio-start test skipped. This is not a browser audio test.
- Real-engine replay: 45 trials in 305.14 seconds including initialization; four stop/restart cycles and four silent controls, no empty final output or pipeline error. First Japanese P50/P95/max: 1,250/2,037/2,073 ms; first Chinese: 1,342/2,247/2,455 ms; final delay after clip end: 1,156/1,771/2,246 ms. These are warmed, repeated development recordings, not live capture. Package building, UI checks, and extension reload occurred during the run. Cancellation logs for superseded interim translations are expected and are not counted as failed final results. [Raw report](tests/results/stage9-continuous.jsonl), [summary](tests/results/stage9-continuous-summary.json).
- Quality limitations remained visible: one output rendered preparing summer bedding as bedding for “summer hibernation,” and another changed the meaning of finding it difficult to tell someone their nose hair is showing. No semantic-accuracy pass is claimed.
- Installed desktop package: version 3.8.1, runtime bytes matched the tested build, renderer assets present, signing valid, native addon loader portable. Opera's extension manager confirmed 3.8.1 after reload. Actual capture used a separate Opera window playing a Japanese video without native captions. Japanese-only text followed by Chinese, subsequent sentence updates, and four-pair content turnover were observed. Early diagnostics showed processing P50/P95 611/948 ms, queue P50/P95 0/2 ms, latest audio-end-to-Chinese 949 ms, queue depth zero, and no expired/rejected/resynchronized audio. These are a small early sample, not an end-to-end benchmark. The test window closed during inspection before a final diagnostic snapshot or Stop-button check; the desktop returned to idle, and the user's other window remained open. [Smoke record](tests/results/stage9-opera-smoke.json).

## Remaining acceptance work

- Measure the preview change under matched browser audio, including onset-to-first-Chinese percentiles and sustained load. Controller coverage alone does not establish an end-to-end speedup.
- Improve translation of tense, speaker intent, negation, and natural conversational phrasing on an unseen, independently graded corpus.
- Repeat a matched upstream comparison across multiple speakers and realistic audio conditions. Previous one-hour results apply to 3.8.0 and are not relabeled as a 3.8.1 soak.
- Audit stop-time handling of audio still queued in the browser, separately from already recognized final text.
