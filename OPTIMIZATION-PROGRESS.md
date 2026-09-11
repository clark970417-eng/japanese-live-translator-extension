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

## 2. Translation quality: measured improvements, residual style limitation

A 16-case local-model spot check preserves the tested negation, counts, direction,
and present/future versus past distinction. A general tense contrast in the prompt
corrected the previously past-tense rendering of a future inability to stay.
Contextual terminology now keeps livestream and game-clear terminology. Thanks
for coming is more grammatical in Chinese. This is a small authored set, not a
blind or statistically representative accuracy score.

One additional Japanese draft still uses plain form despite polite-style guidance;
awkward wording also remains. The local-draft label no longer promises verified
politeness. No arbitrary string replacement is applied to force grammar.
Text-only drafts now request translation directly instead of initializing speech
recognition first. They remain drafts and are never posted automatically.

[Local model outputs](tests/results/stage2-translation-quality.json).

## Remaining work, in order

3. Sustained behavior: a fault-injection test now feeds real controller
   audio events before and after decoder restart. Previously the first resumed
   frame reset the audio epoch and cleared retained jobs. Recording recovery now
   keeps that epoch and continues VAD intake while the decoder reloads; queued
   utterances survive the retry. The updated regression failed before the fix and
   passes after it in both browser and desktop decoder modes.

   The actual-engine run completed 140 rounds in 1,906.807 seconds (31.8 minutes),
   with 14 stop/reinitializations and 15 silent probes. Every final contained
   Chinese; silent probes returned no text; there were no pipeline fatal/error
   events. The existing initialization fallback from unsupported KV-value
   quantization to default precision still occurred. Main-process RSS ranged
   37.5–86.8 MiB; this excludes Python/Metal and includes harness event storage.
   This repeated synthetic, sequential engine test bypasses browser capture/VAD;
   it does not establish stability for arbitrary hours-long live streams.
   [Raw run](tests/results/stage3-soak.json).
4. UI feedback: distinguish missing audio, recognition work and translation work;
   preserve existing website translation and caption modes.
5. Controlled upstream comparison: shared audio and language settings, cold/warm
   trials, longer sessions, and normal multitasking. Report both typical and slow
   cases with accuracy checks. Do not label untested optional features as verified.
