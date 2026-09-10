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
- No analytics, automatic posting, or cloud upload of source audio.

## System design

Audio is captured from the active tab with Chromium's tab capture API. An `AudioWorklet` streams samples to a resampler and a Silero V5 worker. Speech windows are sent to a separate Whisper worker so interface updates, detection, and recognition do not block one another.

Continuous speech is divided into bounded five-second windows with approximately one second of overlap. Consecutive recognition hypotheses are aligned to avoid displaying older text again. Japanese output is published first; translation runs independently and fills the matching Chinese line later. In ordered-record mode, completed recognition is stored before translation so a slow network request does not prevent the next utterance from being recorded.

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

Source audio is processed locally in the browser and is not uploaded by this project. Recognized text is sent to the selected translation endpoint. API credentials are stored in `chrome.storage.local` and are not included in this repository. Transcript text remains in browser storage until the user clears it. The project contains no analytics or telemetry.

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

The integration passes 45 extension tests, 486 desktop tests, and five Python
bridge tests. Coverage includes native response ordering, source-before-translation
events, invalid audio, warmup failures, silent PCM, and existing caption behavior.
These tests do not establish long-session or commercial-product parity.

The end-to-end browser fixture at `tests/capture.html` uses the production capture
and caption path with a 10.7-second synthetic Japanese recording. Historical
browser-only measurements are recorded in [RETEST-3.4.8.md](RETEST-3.4.8.md);
they should not be interpreted as measurements of the new desktop backend.

## Limitations

- Recognition quality can decrease with music, overlapping speakers, proper names, noise, and very short utterances.
- Translation quality and latency depend on the external service and network conditions.
- Picture-in-picture windows cannot host a normal page content-script overlay.
- Long-duration livestream stability has not been certified through a formal soak test.
- The model has not been fine-tuned for this project.

## Third-party components

The project includes Transformers.js, ONNX Runtime Web, and the Silero V5 model. Licensing and implementation references are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
