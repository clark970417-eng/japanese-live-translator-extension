# 3.8.4: cancellation-aware translation scheduling and recovery

The broader latency and semantic-quality overhaul remains in progress. This revision rebuilds the shared translation worker's waiting-work lifecycle and separates expected cancellation from damaged inference state. It does not establish universal superiority over LiveTranslate.

## Architecture changes

- Replace the promise-chain request mutex with an explicit serial queue. Cancelled waiting requests are removed immediately and release admission capacity. Accepted, non-cancelled work remains FIFO; model acquire/release operations retain serialization.
- On cancellation or request timeout, retain exclusive ownership while asking the worker to stop. Reject late success responses instead of presenting them as completed translations. If the worker does not acknowledge within one second, terminate only that owned process and allow the next model-bound request to initialize a replacement.
- Preserve the existing context allocation after a cooperative cancellation, clearing conversation history before reuse. Genuine timeouts, output-limit failures, native failures, and unsuccessful resets still invalidate it. This avoids rebuilding the translation context after every obsolete interim result.
- No language prompt, model default, or translation-quality heuristic changed.

The old behavior was reproduced with a failing regression test: request timeout abandoned the result without cancelling inference, allowing the next job into the worker's internal backlog. The revised test passes. Additional tests cover a frozen process, a late result after cancellation, model restoration, and freeing 49 cancelled waiting requests without dropping the active or subsequent accepted request.

## Real-model experiments

Twelve repeated cancellation/retranslation cycles used local HY-MT1.5 1.8B. Both variants include the new queue lifecycle; the first discards context on cooperative cancellation and the second retains it. These are sequential warmed development runs, not a randomized end-to-end browser comparison.

| Measurement | Discard context | Retain context |
| --- | ---: | ---: |
| Median cancelled-generation + following complete translation | 679 ms | 424 ms |
| Maximum in these 12 cycles | 3,990 ms | 1,401 ms |
| Following output identical to reference | 12/12 | 12/12 |

The figures exclude capture and recognition and must not be described as livestream latency. Raw results: [discard](tests/results/stage12-worker-recovery.jsonl), [retain](tests/results/stage12-worker-reuse.jsonl).

A separate run checked 12 semantic development sentences after cancelling an unrelated travel sentence. All final strings matched their respective uncancelled reference. This checks cross-request contamination, not translation accuracy: the existing incorrect reassurance translation remains incorrect. [Results](tests/results/stage12-content-recovery.jsonl).

The same isolated test deliberately froze its own child process. Cancellation returned after about 1.10 seconds; replacement initialization and a complete translation finished after about 2.79 seconds total. The restored output matched the reference. This is injected-fault evidence, not a normal latency measurement. No installed application or user browser process was targeted.

## Verification

- Desktop tests: 539 passed across 52 files; TypeScript check passed.
- Extension tests: 70 passed.
- Production package passed archive/runtime-byte, renderer asset, code-signature and native-addon portability checks (6,942 archive entries). The installed desktop bundle passed the same checks; all 26 installed extension files matched 3.8.4. Opera was subsequently reloaded and verified as 3.8.4 in a separate test window: the popup showed the matching version, audio capture produced successive Japanese/Chinese caption pairs on a video without native captions, and Stop drained to Ready. The test window was closed afterward. This smoke test still showed recognition/translation inaccuracies and does not establish a complete feature or quality pass. The previous installed desktop bundle was preserved.
- Real-audio replay: 46 segments, 4 restarts and 4 silent controls over 306.2 seconds including initialization; no empty finals or pipeline errors. First Chinese median/p95/max: 1222/2047/2104 ms. Final delay after audio end median/p95/max: 808/2395/2942 ms. These are repeated known read-speech inputs; capture/VAD/browser rendering are excluded. This is not a matched upstream comparison or proof of performance under arbitrary load. [Raw results](tests/results/stage12-continuous.jsonl).

## Remaining work

Normal high-load end-to-end latency, semantic mistranslations, diverse long-session comparison with upstream, and complete feature acceptance remain open. A worker restart cannot recover arbitrary unpersisted audio after a browser/process crash. This release does not claim that those goals have been met.

## Quality probe rejected; benchmark alignment correction

The [official prompt probe](tests/results/stage12-official-prompt.jsonl) was not adopted. It reversed the transfer direction in a developer case (receiving from her versus giving to her). Inspection also found that the script's historical `current` prompt spelled the target label `繁体中文`, whereas the application uses `繁體中文` for `zh`. The script has been aligned. Historical prompt-probe baselines must not be treated as byte-identical production prompts. The actual-worker cancellation/content and audio tests above are unaffected. The official wording comes from the [model publisher](https://huggingface.co/tencent/HY-MT1.5-1.8B#prompt-template-for-zhxx-translation).

The [aligned rerun](tests/results/stage12-aligned-prompt.jsonl) retained that decision: the official prompt improved a reassurance but reversed who receives an object, and neither variant reliably preserved completed past tense. The default prompt was not changed. One repeat launched before the script correction completed is retained locally as an excluded setup run; it is not labeled as the aligned result.
