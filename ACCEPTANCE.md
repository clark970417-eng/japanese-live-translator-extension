# Translation improvement acceptance criteria

Status: in progress. These are targets, not achieved results.

## Comparison protocol

Compare against the pinned upstream revision documented in
[COMPARISON-LIVETRANSLATE.md](COMPARISON-LIVETRANSLATE.md). Record model, quantization,
engine settings, app revision, audio, cache state, power state and measurement
boundary. Alternate execution order and run only one inference benchmark at a
time. Keep cold startup, warm unseen speech and repeated cached speech separate.
Do not compare browser capture measurements directly with engine-only results.

## Release gates

| Area | Required evidence | Current gap |
| --- | --- | --- |
| Initial Chinese latency | Warm unseen speech median at most 2 seconds from speech onset, with p95 reported; beat upstream median without a worse p95 on matched conditions | 3.8.0 repeated JSUT engine-only median 1.43 s, p95 2.45 s; unseen/browser gate remains unproven |
| Final translation latency | Report delay after actual speech end; no regression relative to upstream on paired samples | Twenty read-speech inputs: median 1.40 s after speech end; not a broad live comparison |
| Fidelity | Blind review of unseen JA→ZH and ZH→JA examples; preserve negation, tense, speaker intent, names and numbers; report interim errors separately | Known tense, invitation and invented-context errors remain |
| Streaming correctness | Immediate Japanese updates; no shorter translation overwriting an already translated compatible hypothesis; late responses cannot restore a stopped session | Late-work and model-affinity regression tests pass; actual Opera captions observed, complete release matrix pending |
| Silence | No captions on silent controls; separately report music and background-noise false positives | Silent PCM covered; varied background audio still needed |
| Long sessions | At least 60 minutes of diverse inputs; measure queue age and process memory, exercise stop/start and disconnect recovery; no dropped accepted final utterances | 60.02-minute repeated JSUT stress completed: 329 trials, 32 restarts, no empty finals; diverse live inputs and all accepted-audio loss remain unproven |
| Browser UX | Actual Opera checks for YouTube, Shorts and X composers; both subtitle modes, four-group turnover, movement, resizing and opacity | Installed scheduler update passed YouTube audio, four-group turnover and Stop smoke; YouTube/Shorts composers checked; X and complete appearance matrix still needed |
| Feature compatibility | Enumerate upstream features and verify supported platforms independently, retaining extension-specific functionality | macOS testing cannot establish Windows parity |
| Deployment | Clean build and tests, commit and push, installed file verification and runtime version check | Verified 3.8.0 bundle installed; Opera reloaded, runtime smoke passed; source publication is traceable in repository history |

## Reporting rules

Keep raw failures as well as successes. Freeze an evaluation set before tuning;
examples used to tune prompts are development cases, not blind quality evidence.
Synthetic speech and repeated fixtures are regression controls, not proof of
accuracy on live conversations. A feature inventory is not a functional test.
Report each gate as passed, failed or untested. Do not claim universal superiority
from a subset of passing gates.
