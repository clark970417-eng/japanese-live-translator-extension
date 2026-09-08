# Japanese Live Caption Translator

![Extension icon](./icon-preview.png)

A Chromium browser extension that generates bilingual Japanese–Traditional Chinese captions for online video and live audio. It combines in-browser speech recognition, voice activity detection, incremental transcript rendering, and network translation in a single extension.

## Project overview

The project explores a practical accessibility problem: live Japanese media often has no captions, while conventional translation tools either require a separate desktop application or wait for a complete sentence before showing output. This extension captures audio from the active browser tab, detects speech locally, displays Japanese as recognition progresses, and adds a Traditional Chinese translation when it becomes available.

It supports two independent workflows:

- **Page text translation** translates Japanese video titles, live chat messages, comments, and X posts into Traditional Chinese.
- **Audio captioning** captures the current video or X Spaces tab and produces movable, resizable bilingual captions.

The extension never publishes a message automatically. Its optional writing assistant creates a Japanese draft from Chinese text and leaves review and submission to the user.

## Key features

- Local Japanese speech recognition with Whisper Small FP32 through WebGPU.
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

The first run downloads and caches the Whisper Small model. A WebGPU-capable Chromium browser is required. Translation requires an internet connection; optional provider credentials can be stored in the extension settings.

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

Version 3.4.8 passes 44 automated tests. The suite covers resampling continuity, speech segmentation, queue ordering, stale-result rejection, repeated speech, translation timeout recovery, caption visibility, dragging, resizing, and decoder restart behavior.

The end-to-end browser fixture at `tests/capture.html` uses the production tab-capture, VAD, Whisper, translation, and rendering path with a 10.7-second synthetic Japanese recording. In the latest Opera GX run, the first Japanese text appeared at 6.02 seconds, later Japanese updates appeared at 9.77 and 9.92 seconds, and corresponding Chinese updates appeared at 9.92 and 10.52 seconds. These measurements describe one controlled run and are not a general latency guarantee. Detailed evidence is recorded in [RETEST-3.4.8.md](RETEST-3.4.8.md).

## Limitations

- Recognition quality can decrease with music, overlapping speakers, proper names, noise, and very short utterances.
- Translation quality and latency depend on the external service and network conditions.
- Picture-in-picture windows cannot host a normal page content-script overlay.
- Long-duration livestream stability has not been certified through a formal soak test.
- The model has not been fine-tuned for this project.

## Third-party components

The project includes Transformers.js, ONNX Runtime Web, and the Silero V5 model. Licensing and implementation references are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
