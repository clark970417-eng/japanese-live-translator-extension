# 3.9.5 live latency and confidence-routing verification

Version 3.9.5 targets the observed delay where a stream had advanced several
sentences before the first Japanese caption appeared.

## Changes

- Cascade capture now starts its timer at detected speech onset. The first
  rolling hypothesis is eligible at 500–600 ms instead of depending on a timer
  that began when capture was opened.
- The cadence backs off to the selected interval and then 1.1 seconds during a
  long uninterrupted utterance, reducing redundant rolling-window inference.
- The main-process audio port retains only the newest waiting rolling window
  while STT is busy. A final VAD segment discards obsolete preview work.
- VAD finalization waits 600 ms instead of 800 ms in the desktop capture path.
- A low-confidence, non-trivial final sentence is routed to the configured
  quality translator when adaptive routing is enabled. Tiny hesitation fragments
  stay on the fast engine.
- Opera's first rolling browser hypothesis is eligible near 650 ms instead of
  800 ms. New installs default to the live, single-caption mode.

## Verification

- Desktop type checking and production build passed.
- Desktop: 68 files and 661 tests passed.
- Opera extension: 110 tests passed, including the new 650 ms eligibility gate.
- The arm64 macOS package contains version 3.9.5, 7,574 archive entries, matching
  runtime bytes, renderer assets, a valid local signature and a portable native
  addon loader.
- The installed `/Applications/Japanese Live Translate.app` reports 3.9.5 and is
  running. Opera GX reloaded the unpacked repository extension and displayed
  version 3.9.5.
- Opera was set to `即時優先 · 單組字幕` and `桌面程式 · 共用引擎設定` for the
  next capture.

## Installed real-engine probe

The installed companion initialized `mlx-whisper + hunyuan-mt-15`. Three speech
clips produced Japanese and Chinese with zero blank captions and no reordering.
Rolling-window round-trip medians were 1,185 ms, 1,291 ms and 1,517 ms; maxima
were 1,424 ms, 1,789 ms and 1,518 ms. The harness sends its first window at
800 ms, so it does not measure the extension's new 650 ms capture threshold.

The probe ended after those three trials because its optional
`music-only-control.wav` fixture was absent. That is recorded as missing test
data, not a successful music-control result.

These measurements are from this Apple Silicon Mac and local fixtures. Live
site load, speaker accent and audio quality can still change end-to-end latency
and recognition accuracy.
