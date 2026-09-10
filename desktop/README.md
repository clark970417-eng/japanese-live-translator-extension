# Native caption companion (experimental)

The extension controls an on-demand Python companion through Chromium native
messaging. Tab capture and caption rendering remain in the extension. Whisper
Small runs through MLX; HY-MT1.5-1.8B translates recognized Japanese directly
into Traditional Chinese, with OpenCC normalization. No paid API is used for
audio captions in this mode. Chinese-to-Japanese reply drafts also use the local
model when desktop mode is selected, with a polite, friendly style instruction.
Drafts are presented for review and are never sent automatically. The companion
also supports Japanese-to-English requests; live captions remain Traditional
Chinese. Website translation retains its existing routing.

Initial local checks: Japanese-to-Chinese 606 ms, Chinese-to-Japanese 689 ms,
Japanese-to-English 213 ms for three short sentences. One Opera tab-capture
fixture produced its first Japanese at 2.86 s and Chinese at 3.61 s. These are
individual observations, not latency guarantees. The first browser run exposed
an untranslated Japanese sentence; a clearer target-language prompt corrected
that sentence in a subsequent model check. Longer live-session evaluation is
still required.

## Setup on Apple Silicon

Create a Python 3.11 virtual environment under
`~/Library/Application Support/JapaneseLiveCaption/venv`,
install `desktop/requirements.txt`, and run its Python interpreter with
`desktop/install.py --extension-id YOUR_EXTENSION_ID`. The installer copies
the companion into Application Support. Keep the environment in place. Reload the
extension, select the desktop engine, then start audio capture. Initial startup
downloads model weights; subsequent starts use the local cache.

## Upstream integration

The bounded LRU translation cache and glossary prompt format in
`translation_support.py` adapt
[LiveTranslate](https://github.com/rioX432/live-translate), commit
`3d333e6296240d17dfc72207eac7fd7a7499a663`. Its MIT notice is preserved in
`LIVE_TRANSLATE_LICENSE`. The application is not a wholesale fork: this bridge
uses MLX instead of LiveTranslate's node-llama-cpp translation process.

Model weights have their own licenses; the upstream application's MIT license
does not cover HY-MT weights. Models are downloaded separately, not bundled.

## Limits

This is windowed recognition, not a newly trained streaming model. Recognition
and translation currently share one serial native process. Latency depends on
speech segmentation and inference as well as translation. A successful text
translation alone does not verify live audio capture, silence rejection, or
long-session stability. No fine-tuning has been performed.
