# Release quality gates

A version is eligible for public release only after all automated gates pass.

## Automated on every change

- Type checking, unit tests and production build on Apple Silicon macOS, Intel macOS, Windows x64 and Linux x64.
- The browser extension test suite.
- FFmpeg presence and decoding support for MP3, WAV, FLAC, OGG/Opus, WebM/Matroska, MP4/MOV/M4A, MPEG-TS and AVI.
- Repeated pipeline, worker recovery, bounded translation and file-audio tests on the nightly schedule.

## Release artifacts

Tagged releases create DMG and ZIP packages for Apple Silicon and Intel Macs, an NSIS installer for Windows x64, and an AppImage for Linux x64. macOS publishing stops unless Developer ID signing and Apple notarization credentials are present. Published artifacts include update metadata consumed by the in-app updater.

## Evidence that cannot be simulated

Public-release confidence also requires real sessions. Record at least one two-hour livestream on each supported OS, plus Japanese speech from Kansai, Kanto and non-native speakers. The repository's soak test records reconnects, duplicate captions, missing finals, stale output, latency and memory use. A release must have no unrecovered crash, no stale subtitle after stopping, and no permanently blocked translation queue.

Run `npm run diagnose:compatibility` in `desktop-app` to write a machine-readable local qualification report. Run `npm run test:stability` for the repeated recovery gate. The longer companion soak remains available for production audio and model testing.
