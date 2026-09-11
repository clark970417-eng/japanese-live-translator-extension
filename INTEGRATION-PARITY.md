# Upstream integration coverage

Baseline: rioX432/live-translate commit
`3d333e6296240d17dfc72207eac7fd7a7499a663` (verified against upstream main on
September 11, 2026). The complete tree is retained under `desktop-app`, including
its license, engine implementations, desktop interface, tests, plugins, and tools.

Source inclusion, connected functionality, and runtime verification are distinct.
Experimental upstream capabilities remain experimental. Cloud features require
user-supplied credentials; optional local engines require their own dependencies
and models. No feature is represented as validated solely because its source exists.

| Capability | Integration route | Verification needed |
| --- | --- | --- |
| Desktop settings and standalone audio | Original desktop interface retained | Device-specific audio permissions and devices |
| Browser captions | Native messaging to the shared desktop pipeline | Audio fixture, lifecycle, both caption modes |
| Streaming/local agreement | `processStreaming` and `finalizeStreaming` | Interim revisions and late results |
| Engine selection and cloud rotation | Shared engine selection/start logic | Each optional provider needs configured credentials |
| Glossary, context, cache | Shared pipeline settings and final translation | Names and domain-specific corpus |
| Adaptive quality routing | Applied before engine initialization; used for streaming final translation | Optional quality model required |
| Recognition correction | Optional setting; correction events return to the same segment | Experimental model behavior |
| Speaker labels, draft STT | Upstream streaming pipeline; optional dependencies | Optional engines required |
| TTS, sessions, summaries, accessibility, global shortcuts | Original desktop features retained | Hardware and optional model-specific checks |
| Noise suppression | Original desktop capture path retained | Browser capture still uses its existing gain and VAD |
| Cloud audio interpretation | Original desktop capture path retained | Browser bridge remains local/cascade audio |
| Updates | Fork repository configured; no releases published | Requires a future distributable release |
| Website translation and Japanese reply drafts | Existing extension retained | Browser smoke tests |
| Single-pair/four-group, draggable captions | Existing extension retained; streamed revisions update in place | Layout and rollover checks |

## Changes beyond the baseline

- Desktop and browser startup now share settings, glossary, routing, and logging.
- A settings-only connection no longer reserves audio capture.
- Explicit stop releases the browser's pipeline ownership.
- Native transport accepts asynchronous caption events after request completion.
- The browser shows source hypotheses without starting a second translation task.
- Late interim translations are invalidated when their utterance finishes.
- Revised hypotheses cannot splice an obsolete confirmed prefix into new text.
- Saved advanced options are returned to the settings interface on reopening.
- HY-MT translation uses deterministic decoding and a stricter fidelity instruction.
- MLX receives the selected source language and rejects high-no-speech,
  low-log-probability results. No blanket ban on genuine greetings is introduced.

## Acceptance status

Core integration checks and a 40-round engine stress test pass. See `RETEST-3.7.2.md`,
`RETEST-3.7.0.md` and `COMPARISON-LIVETRANSLATE.md` for measurements and limitations.
Neither universal parity nor superior performance across every engine is claimed.
