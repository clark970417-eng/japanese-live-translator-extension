# Sequential optimization work

The acceptance target is a measured improvement for Japanese/Traditional Chinese
browser use, not an unqualified claim of superiority across every upstream engine.

## 1. Sentence latency: source-language propagation fixed

The pipeline's source-language selection previously changed routing/cache state
without updating an already-created MLX recognizer. The recognizer could therefore
keep automatic detection after Japanese was selected. The selection now reaches
MLX both on language changes and after engine replacement; `auto` restores detection.
Engines without runtime language selection retain their existing behavior.

Actual local MLX + HY-MT1.5, same 10.7223-second synthetic Japanese fixture, two
sequential warmed rounds before and after, September 11, 2026:

| Measurement | Before | After |
| --- | --- | --- |
| Final STT, round 1 | 872 ms | 486 ms |
| Final STT, round 2 | 792 ms | 489 ms |
| End-of-audio to final Chinese, round 1 | 1.419 s | 1.080 s |
| End-of-audio to final Chinese, round 2 | 0.793 s | 0.489 s |
| First Chinese, round 1 | 2.120 s | 1.661 s |
| First Chinese, round 2 | 1.936 s | 1.620 s |

Round 2 reused final translation cache. Final Chinese output was unchanged.
The benchmark bypasses browser capture/VAD and is not a browser latency guarantee.
An engine already configured as Japanese does not gain the same improvement.
The host was in ordinary use; these are two samples, not a broad performance claim.
Per-engine stage timings are now recorded by the benchmark. An additional
no-timestamp decoding experiment saved only about 30 ms on this fixture and was
not enabled in production.

[Before](tests/results/stage1-language-before.json) ·
[After](tests/results/stage1-language-after.json)

## Remaining work, in order

2. Translation quality: negation, tense, quantities, direction, speaker perspective,
   and natural polite Japanese. Preserve meaning before style.
3. Sustained behavior: slow translation, delayed replies, silence, noise, reconnect,
   and repeated start/stop without stale or duplicated captions.
4. UI feedback: distinguish missing audio, recognition work and translation work;
   preserve existing website translation and caption modes.
5. Controlled upstream comparison: shared audio and language settings, cold/warm
   trials, longer sessions, and normal multitasking. Report both typical and slow
   cases with accuracy checks. Do not label untested optional features as verified.
