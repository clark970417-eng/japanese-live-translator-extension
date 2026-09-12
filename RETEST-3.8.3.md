# 3.8.3: provisional Chinese delivery and exact interim cache reuse

The latency and semantic-quality overhaul is still in progress. This revision changes when generated Chinese becomes visible and avoids duplicate translation of previously completed, identical utterances. It does not claim universal superiority over upstream.

## Changes

- The local translation worker can emit cumulative provisional Chinese while generation continues. The request retains its final completion promise. Output is batched at approximately 80 ms and starts after four characters, rather than sending every token. A hypothesis change, session reset, cancellation, or completed request prevents obsolete chunks from being routed into a new caption.
- Ordinary interim translation uses this callback; final output still replaces the provisional text. Specialized SSBD/SimulMT paths do not gain token streaming in this revision.
- Repeated interim text can reuse an exact completed translation for HY-MT1.5/HY-MT2 when adaptive routing is disabled. This is intentionally limited to models whose translation path ignores previous utterance history; no approximate text matching is used.
- Glossary updates invalidate the completed-translation cache. Work started under an older glossary cannot repopulate that cache after the update.

## Measured post-recognition latency

Six Japanese sentences were tested with the actual HY-MT1.5-1.8B worker, using deterministic recognition output to isolate the translation/display portion. Each completed reference was generated first, then baseline, streamed, and cached variants were ordered alternately. This is warmed repeated text on the user's computer, not an independent live-audio comparison.

| Variant | Median first nonempty Chinese | Median final completion |
| --- | ---: | ---: |
| Wait for complete translation | 258.4 ms | 258.4 ms |
| Provisional output enabled | 96.7 ms | 249.1 ms |
| Exact completed cache hit | 1.3 ms | 1.3 ms |

All final strings matched their corresponding completed reference. A cache hit applies only to previously translated identical text. Four-character provisional output can be an incomplete word or phrase. These figures exclude capture, VAD, and actual recognition and must not be presented as total livestream latency. [Raw trials](tests/results/stage11-streamed.jsonl).

## Translation-quality experiments

Twelve newly authored semantic cases cover negation, tense, speaker roles, quantity, uncertainty, and incomplete speech. Current, concise, and neutral prompts were compared on the 1.8B model; current/concise were also compared on the already-downloaded 7B. The neutral variant was additionally checked against the existing 20-sentence development corpus. These are developer-reviewed experiments, not an independent blind assessment.

No prompt or default-model change was accepted:

- The concise 1.8B prompt often reduced time and embellishment, but changed existing-state uncertainty into future uncertainty in one case.
- Both 1.8B prompts failed to reliably preserve completed past tense. The actual worker probe also mistranslated a reassurance that someone need not force themselves to attend.
- Removing the colloquial-style request improved some outputs but retained material errors and worsened a sentence about telling someone their nose hair was showing.
- 7B improved some phrasing and semantics but was substantially slower in these text probes; it still omitted an incomplete contrast in one concise-prompt output. It was not selected as the default.

Inputs: [semantic cases](tests/fixtures/translation-semantics-stage11.json). Outputs: [1.8B concise](tests/results/stage11-prompts.jsonl), [1.8B neutral](tests/results/stage11-neutral.jsonl), [7B](tests/results/stage11-prompts-7b.jsonl), [neutral corpus comparison](tests/results/stage11-neutral-corpus.jsonl). The scripts record raw output for review and do not claim automated semantic correctness.

## Verification status

- Desktop unit tests: 534 passed; TypeScript check passed before packaging.
- Isolated desktop UI: 13 passed, 1 audio-start test skipped.
- Repeated real-audio replay: 21 segments over 211.79 seconds including initialization, two restarts, two silent controls, no empty final strings or pipeline errors. First Chinese median/max was 2,296/5,230 ms; final delay after audio end median/max was 2,685/6,865 ms. Package construction, tests, and ordinary computer use overlapped this run. These results show remaining variability; they are not a matched latency improvement claim. [Raw replay](tests/results/stage11-continuous.jsonl).
- Installed desktop 3.8.3 passed archive/runtime-byte, renderer-asset, signature, and native-addon portability checks. Opera manager and popup both confirmed 3.8.3 after reload; all 26 installed extension files matched. A separate Opera window played Japanese video without native captions and displayed Japanese/Chinese pairs. An early 444-block snapshot showed processing P50/P95 797/1,213 ms, queue P50/P95 78/510 ms, no dropped/resynchronized audio, and zero queued segments. Four-pair content turnover was subsequently observed, Stop returned the popup to ready, and the test tab was closed. This snapshot is not a full-session latency distribution, and visible translations still contain semantic errors.

High-load end-to-end latency, broader semantic quality, and durable raw-audio recovery remain open. Earlier limitations in [3.8.2](RETEST-3.8.2.md) and [3.8.1](RETEST-3.8.1.md) remain applicable.
