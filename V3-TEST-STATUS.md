# 3.2.1 verification — 2026-09-08

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
