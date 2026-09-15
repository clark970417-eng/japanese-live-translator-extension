# 3.9.8 adaptive first-caption latency verification

Version 3.9.8 reduces the first rolling recognition delay without applying the same aggressive threshold to weak or noisy speech.

## Changes

- Clear speech becomes eligible for its first recognition window at 500 ms.
- Weak or unstable speech retains the earlier 650 ms accuracy guard.
- The first desktop streaming timer starts at acoustic onset, so VAD confirmation time is not added to the configured delay.
- Later previews still back off to the selected cadence and then 1.1 seconds during long speech, preventing inference queues from accumulating.
- Complete utterances continue to replace provisional text for final correction.

## Verification

- Deterministic audio-window measurement: clear speech emitted at 512 ms; weak speech emitted at 672 ms because processing occurs in 32 ms frames.
- Opera extension: 115 tests passed.
- Desktop companion: 68 test files and 661 tests passed.
- Desktop TypeScript checking and production packaging passed.
- `/Applications/Japanese Live Translate.app` reports version 3.9.8 and starts successfully.
- Opera GX reloaded the unpacked extension and reports version 3.9.8.

These are scheduling measurements. End-to-end latency still includes model inference time and depends on the live audio, speaker, and selected recognition and translation engines.
