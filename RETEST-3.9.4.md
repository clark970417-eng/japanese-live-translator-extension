# 3.9.4 media input and translation-engine verification

This release closes two product gaps against the pinned LiveTranslate baseline:
broader FFmpeg file input and direct translation-provider selection.

## Media input

- The bundled FFmpeg path now accepts 41 explicit audio/video extensions,
  including AVI, CAF, M2TS/MTS/TS, MPEG/MPG, WMV, 3GP, AC3, AMR, APE and VOB.
- The file picker and main-process security allowlist use one shared catalog, so
  the interface cannot advertise a format that the decoder rejects by name.
- The bundled FFmpeg 6.0 binary successfully generated and decoded AVI, CAF and
  MPEG-TS fixtures into the production 16 kHz mono float PCM format.
- The existing six-hour decoded-audio bound, decoder timeout and path checks
  remain active.

## Translation engines

- Google Cloud Translation, DeepL, Gemini 2.5 Flash and Microsoft Translator can
  now be selected independently after their required key is configured.
- API auto-rotation remains available for failover and quota sharing.
- Microsoft direct mode requires both its key and region before Start is enabled.
- HY-MT1.5 remains the offline low-latency default; the new choices do not alter
  the user's saved local setup.

## Verification

- Desktop: 67 files and 655 tests passed.
- Opera extension: 109 tests passed.
- TypeScript project checks passed.
- Production renderer/main/preload build passed.
- Signed macOS arm64 application package built successfully.

These changes improve breadth and control. They do not make every online
provider free, and API performance still depends on the provider and network.
