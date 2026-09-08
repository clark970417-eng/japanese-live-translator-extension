# 3.3.0 incremental output verification — 2026-09-08

The same Whisper small FP32 model now emits decoded Japanese during generation, before the full inference returns. This is incremental output from windowed Whisper, not a native stateful streaming acoustic model; encoder work across windows is still repeated. No model fine-tuning was performed.

Changes: 300 ms throttled token previews, incomplete-character protection, no rewind to shorter prefixes from a new decode, provisional/final correction through the existing paired translation scheduler, and draining expired audio jobs without blocking fresh queued work. Reset/seek rejects in-flight old previews. Diagnostics distinguish provisional first text from completed recognition.

Controlled warm A/B/A/B in Opera on the same 10.7-second synthetic Japanese input:

| Mode | First text | Full inference | Preview updates |
| --- | ---: | ---: | ---: |
| Wait for complete result | 1045 ms | 1045 ms | 0 |
| Incremental output | 441 ms | 1073 ms | 3 |
| Wait for complete result | 1100 ms | 1100 ms | 0 |
| Incremental output | 457 ms | 1093 ms | 3 |

The complete transcriptions matched. An earlier pair measured 1167 ms baseline versus 516 ms first incremental text / 1156 ms completion. These measure inference on already-available audio, excluding audio collection, translation and rendering. Digital silence still produced zero VAD segments; 1% volume fixture still produced speech segments.

22 automated tests cover the controller and streamer in addition to the prior regressions. The controller test uses mocked audio/worker surfaces; actual model runs use the browser harness. The new `tests/capture.html` runs the normal extension capture, translation and overlay against a known WAV, for a separate end-to-end check.

Actual tab-capture runs rendered changing Japanese/Chinese pairs. In the later run, the first Japanese appeared at 3.71 seconds and Chinese at 3.86 seconds after playback; the overlay was absent after the file ended while the history remained. Decode P50/P95 was 2336/3416 ms. These are one synthetic input under concurrent browser use, not a live accuracy benchmark. This run still reproduced earlier-sentence rewind when the model changed kana/kanji spelling, and a final recognition error. Preview alignment now suppresses any ambiguous changed completed prefix, with a regression assertion, rather than only long unpunctuated drafts. That last safeguard passes automated tests but has not yet been reloaded and rechecked in Opera. Version 3.3.0 was observed in the popup before that final safeguard. The installed directory contains the final files; runtime reload remains required. This is a prerelease, not completed live acceptance or native stateful streaming.

## Previous 3.2.1 verification

## Implemented

- Silero V5 neural speech detection in a dedicated WASM worker; no energy-only fallback.
- Continuous 44.1/48 kHz to 16 kHz resampling without per-block clock loss.
- Hysteresis, onset pre-roll, expanding partial windows, bounded 12 second context and approximately 2 second overlap at long-window boundaries.
- Two-hypothesis common-prefix stability, provisional/final state, overlap text alignment and stale epoch/revision rejection.
- Bounded audio and decode queues, explicit overload resynchronization and one ASR worker restart on failure.
- At most two concurrent subtitle translations and one coalesced latest pending cue. Completed source/translation pairs can publish before the newest request finishes; older completions cannot replace a newer pair. Stopped sessions are aborted. Full short cues preserve Japanese context.
- Bounded smoothed input gain (maximum 12x) before VAD/ASR, without changing playback volume.
- Local Whisper small FP32, replacing tiny q4. Native enabled Japanese YouTube CC retains priority; no-CC streams use ASR immediately.
- P50/P95 recognition, VAD, first Japanese and queue measurements; translation/audio-end latency and dropped/rejected counters in diagnostics.

## Automated checks

`node --test tests/*.test.mjs`: 17 passing tests. Coverage includes resampling continuity, bounded gain, silence and short speech segmentation, bounded overlapping windows, stable prefixes, authentic repeated phrases, timestamp/session ownership, native/ASR arbitration, and slow/out-of-order translation completion without starvation.

## Actual model verification in Opera GX

Device reports Apple M5 and 16 GB system memory. GPU core count was not independently checked.

Synthetic Kyoko Japanese speech, 10.7 seconds, plus 10 seconds of digital silence. Silero emitted zero segments during silence. New worker explicitly reported `whisper-small`, `fp32`. Complete source was correctly recognized, including 魚が逃げてしまいました and 来てくれてありがとうございます. Whole-input first inference: 1680 ms. VAD-padded 11.78-second segment warm inference: 1098 ms. These are model timings, not end-to-end live latency or a broad accuracy score.

Earlier purported model comparisons were invalid due to a stale cached worker and are excluded. Worker URLs now include a release version; the browser harness uses a unique URL per run and logs model identity.

Low-volume regression: before input gain, 1% amplitude fixture emitted zero VAD windows; after gain it emitted 15. Digital silence still emitted zero. After gain, the complete fixture remained correctly recognized (3797 ms whole input / 4551 ms padded segment in that run). Timing varied between runs and browser foreground/background activity; the earlier 1098 ms result is not a guaranteed latency.

## Limits

LocalAgreement here is character-prefix based, not upstream Whisper-Streaming word-timestamp alignment. Music containing vocals, overlapping speakers, names and very short phrases may still be mistranscribed. Neural VAD is not proof that text is correct. This version does not claim zero latency or measured parity with a commercial service. Translation uses external providers and depends on network availability.

## Live extension checks

Opera Extensions displayed version 3.2.1 after Reload; the popup also displayed 3.2.1. Started capture on a Japanese YouTube livestream whose player reported no CC. Runtime reported `whisper-small fp32`, active audio blocks, completed recognition and translation, and zero queue drops/resynchronizations in sampled snapshots. A 3.2.1 snapshot reported recognition 1922 ms, translation 1322 ms and audio-end-to-Chinese 5193 ms, with recognition P50/P95 1853/1922 ms and queue P50/P95 492/1034 ms. These are sampled diagnostics, not a controlled latency benchmark.

Stop was exercised on 3.2.0 before loading 3.2.1, then capture started successfully on 3.2.1. Earlier 3.2.0 snapshots recorded audio-end-to-Chinese 2463 and 3458 ms. These versions are not an A/B performance comparison.

Continuous visual verification of 3.2.1's bilingual overlay, a live pause/silence regression and a long soak remain incomplete because the browser was being switched by other interaction. No screenshot-based pass or commercial-parity claim is made. The synthetic silence and controlled asynchronous translation tests passed; they do not replace those remaining live checks. This release is a prerelease.
