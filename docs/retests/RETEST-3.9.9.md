# 3.9.9 early translation verification

Version 3.9.9 enables the live-stream translation preset: Conversational SimulMT with Wait-k 2.

## Behavior

- Translation starts once two Japanese units are available and produces provisional Chinese while speech continues.
- The persistent SimulMT session reuses its KV cache between revisions.
- Completed utterances still receive final translation correction.
- Stale provisional results remain generation-gated and cannot overwrite newer speech.
- HY-MT 1.5 remains the selected fast local translator; no audio or text is sent to a cloud service.

## Verification

- Opera extension: 115 tests passed.
- Desktop companion: 68 test files and 661 tests passed.
- Desktop TypeScript checking and production packaging passed.
- The installed app reports version 3.9.9.
- Existing local settings were changed to a 500 ms streaming interval, Conversational SimulMT enabled, and Wait-k 2. The desktop app confirmed that the browser-caption settings were saved.
