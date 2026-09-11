# Japanese Live Caption Translator

![Extension icon](./icon-preview.png)

A Chromium browser extension that generates bilingual Japanese–Traditional Chinese captions for online video and live audio. It supports browser inference and a local desktop companion while keeping caption controls in the browser.

The complete upstream LiveTranslate application is included in
[desktop-app](desktop-app/INTEGRATION.md), with attribution and a private browser
bridge. This integration preserves the extension's page translation, Japanese
reply drafts, caption modes and visual controls. See the integration notes for
the implemented path, tests and remaining limits.

## Project overview

The project explores a practical accessibility problem: live Japanese media often has no captions, while conventional translation tools either require a separate desktop application or wait for a complete sentence before showing output. This extension captures audio from the active browser tab, detects speech locally, displays Japanese as recognition progresses, and adds a Traditional Chinese translation when it becomes available.

It supports two independent workflows:

- **Page text translation** translates Japanese video titles, live chat messages, comments, and X posts into Traditional Chinese.
- **Audio captioning** captures the current video or X Spaces tab and produces movable, resizable bilingual captions.

The extension never publishes a message automatically. Its optional writing assistant creates a Japanese draft from Chinese text and leaves review and submission to the user.

## Key features

- Local Japanese recognition through browser WebGPU or the full desktop MLX engine.
- Silero V5 voice activity detection in a dedicated worker.
- Incremental Japanese hypotheses before the final recognition result.
- Traditional Chinese translation with bounded requests and fallback handling.
- Two display modes: one low-latency caption pair or a four-entry ordered transcript queue.
- A movable and resizable caption panel with configurable type size, color, outline, background, and opacity.
- Persistent transcript records, failed-translation retry, and text export.
- Translation of YouTube titles, chat, comments, and X posts.
- Local audio processing by default, with optional cloud engines in the desktop application; no automatic posting.

## System design

Audio is captured from the active tab with Chromium's tab capture API. An `AudioWorklet` streams samples to a resampler and a Silero V5 worker. Speech windows are sent to a separate Whisper worker so interface updates, detection, and recognition do not block one another.

The desktop path sends growing speech windows to the upstream streaming processor, with a twenty-second safety bound and no cross-window overlap. Local agreement aligns recognition hypotheses. Japanese output is published first; asynchronous translation fills the matching line without starting a duplicate browser translation request. The browser-only fallback keeps its existing bounded overlapping windows. Ordered-record mode retains completed utterances while translations finish.

This is windowed incremental recognition rather than a stateful streaming acoustic model. It reduces perceived latency, but it cannot provide zero-delay transcription or perfect recognition.

## Installation

1. Clone or download this repository.
2. Open `opera://extensions` in Opera GX or `chrome://extensions` in Chrome.
3. Enable Developer mode.
4. Select **Load unpacked** and choose the directory containing `manifest.json`.
5. Refresh the target YouTube or X page, open the extension, and select **Start audio**.

Browser mode downloads Whisper Small and uses network translation. Desktop mode
requires the [local app and native messaging registration](desktop-app/INTEGRATION.md);
audio captions and Japanese reply drafts then use local models after their initial
download. Website text translation retains its existing provider routing.

## Privacy and security

The default browser and MLX desktop recognition paths process audio locally. Browser-mode and website translation may send recognized or page text to the selected provider. Optional cloud engines in the full desktop application can send audio or text to their configured providers. Extension credentials are stored in `chrome.storage.local`; desktop settings use the application store. Neither is committed. Transcripts remain locally until cleared. The upstream application also retains its local usage metrics and session logging.

## Repository structure

- `background.js` — translation scheduling, caption state, and extension control.
- `offscreen.js` and `audio-worklet.js` — tab capture and audio processing.
- `speech-worker.js` — WebGPU Whisper inference.
- `vad-worker.js` and `vendor/silero/` — local voice activity detection.
- `streaming.mjs` — resampling, overlapping speech windows, hypothesis alignment, and latency metrics.
- `content.js` and `x-content.js` — page integration and translation controls.
- `caption-window.js` — movable and resizable bilingual caption interface.
- `popup.js` — settings, diagnostics, transcript export, and start/stop controls.
- `tests/` — unit, integration, browser, VAD, and tab-capture fixtures.

## Verification

Run the automated suite with:

```sh
node --test tests/*.test.mjs
```

The integration passes 47 extension tests, 490 desktop tests, and five Python
bridge tests. Coverage includes native response ordering, source-before-translation
events, invalid audio, warmup failures, silent PCM, and existing caption behavior.
These tests do not establish long-session or commercial-product parity. See
[3.7 verification](RETEST-3.7.0.md) and the [upstream comparison](COMPARISON-LIVETRANSLATE.md).

The end-to-end browser fixture at `tests/capture.html` uses the production capture
and caption path with a 10.7-second synthetic Japanese recording. Historical
browser-only measurements are recorded in [RETEST-3.4.8.md](RETEST-3.4.8.md);
they should not be interpreted as measurements of the new desktop backend.

## Limitations

- Recognition quality can decrease with music, overlapping speakers, proper names, noise, and very short utterances.
- Translation quality and latency depend on model choice, available compute, and, for network providers, service and network conditions.
- Picture-in-picture windows cannot host a normal page content-script overlay.
- Long-duration livestream stability has not been certified through a formal soak test.
- The model has not been fine-tuned for this project.

## Third-party components

The project includes Transformers.js, ONNX Runtime Web, and the Silero V5 model. Licensing and implementation references are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
