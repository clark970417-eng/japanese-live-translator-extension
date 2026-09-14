# 3.9.0 capability comparison

Reference: upstream `3d333e6296240d17dfc72207eac7fd7a7499a663`.

| Area | 3.9.0 result | Upstream comparison |
| --- | --- | --- |
| Audio and file input | App file picker, Chromium decoding, mono 16 kHz resampling, quiet-boundary segmentation | Added usable file workflow; upstream has live capture only |
| Speaker labels | FluidAudio bridge compiles against current API, ships inside the app, and passes speaker index to browser captions | Removes upstream's manual CLI build/install requirement |
| Global shortcuts | Seven system-wide actions retained and covered by tests | Feature parity |
| TTS | Kokoro voice automatically follows the translation language; output device remains selectable | Fixes the upstream English-default voice mismatch |
| Virtual microphone | TTS can target a virtual output device; native PortAudio route remains available on supported macOS/Windows versions | Feature parity; third-party virtual audio driver is still required |
| Translation engines | Adds HY-MT2 7B while retaining local, Apple and BYOK cloud choices; engine startup errors are contained and local failure can fall back to configured Google | Broader local engine choice |
| Updates and releases | Tagged releases build and publish macOS arm64 and Windows x64 updater artifacts | Produces updater metadata instead of draft DMG-only releases |

Verification performed on the fork:

- Desktop TypeScript check passed.
- Desktop unit suite: 65 files, 644 tests passed.
- Browser extension suite: 107 tests passed.
- Production renderer/main/preload build passed.
- Packaged macOS 3.9.0 app passed deep code-signature verification.
- The packaged FluidAudio bridge initialized its downloaded models and returned `ready`.

Limits: virtual microphone routing still depends on a system virtual-audio driver. Accuracy and latency superiority remain workload-specific; the existing frozen corpus and live Opera tests are the evidence for those separate claims.
