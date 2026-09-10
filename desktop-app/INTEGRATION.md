# Japanese Live Translate integration

This directory contains the complete LiveTranslate source tree, imported with
Git subtree from rioX432/live-translate at commit
3d333e6296240d17dfc72207eac7fd7a7499a663. The upstream MIT license remains intact.
Model weights retain their separate licenses and are not committed.

The fork adds a private Unix-domain socket for the browser's native-messaging
host. It uses the production TranslationPipeline, MlxWhisperEngine, and
HunyuanMT15Translator with the upstream node-llama-cpp worker. The Python relay
only transports messages and starts the app; it does not perform inference.

The extension keeps tab capture and speech segmentation, website translation,
Japanese reply drafts, single-pair and four-group caption modes, and movable,
resizable caption styling. Japanese source events are returned before translation
finishes. Completed translations are reused by the extension rather than requested
twice. The desktop pipeline owns recognition, context, translation cache and engine
recovery. The browser adapter currently uses the upstream finalized-chunk process
entry point, as its original Chrome adapter did; it does not claim true incremental
audio decoding or zero latency.

Local changes add Traditional Chinese target prompts, friendly Japanese reply
style, retryable translator initialization, bounded local requests, disconnection
cleanup, response identifiers, and preservation of source text after translation
failure. The macOS 26 PortAudio crash guard remains enabled.

Build: `npm install`, `npm run typecheck`, `npm test`, `npm run build`.
For a local arm64 app, run `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder
--mac dir --publish never`. This produces an unsigned local build, not a notarized
public distribution. Register `desktop/install.py --extension-id ID --app EXECUTABLE`
using the companion Python environment. Start the app with `--jtl-companion` to
avoid automatic onboarding downloads and upstream update checks. No GitHub Release
is required.

The legacy Python inference host remains available by reinstalling without `--app`.
Browser WebGPU mode also remains available. Retain these fallbacks until longer
live-audio testing validates the new backend.
