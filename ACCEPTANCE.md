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
| Initial Chinese latency | Warm unseen speech median at most 2 seconds from speech onset, with p95 reported; beat upstream median without a worse p95 on matched conditions | Installed 3.7.4 fixture results were 3.58–5.82 seconds; no representative p95 |
| Final translation latency | Report delay after actual speech end; no regression relative to upstream on paired samples | Short fixture runs only |
| Fidelity | Blind review of unseen JA→ZH and ZH→JA examples; preserve negation, tense, speaker intent, names and numbers; report interim errors separately | Known tense, invitation and invented-context errors remain |
| Streaming correctness | Immediate Japanese updates; no shorter translation overwriting an already translated compatible hypothesis; late responses cannot restore a stopped session | Confirmation-triggered shortened retranslation reproduced and patched; live validation pending |
| Silence | No captions on silent controls; separately report music and background-noise false positives | Silent PCM covered; varied background audio still needed |
| Long sessions | At least 60 minutes of diverse inputs; measure queue age and process memory, exercise stop/start and disconnect recovery; no dropped accepted final utterances | Earlier 31.8-minute repeated-fixture test does not satisfy this gate |
| Browser UX | Actual Opera checks for YouTube, Shorts and X composers; both subtitle modes, four-group turnover, movement, resizing and opacity | Previous checks span different builds; a single release matrix is needed |
| Feature compatibility | Enumerate upstream features and verify supported platforms independently, retaining extension-specific functionality | macOS testing cannot establish Windows parity |
| Deployment | Clean build and tests, commit and push, installed file verification and runtime version check | Complete after release gates; file copying alone is insufficient |

## Reporting rules

Keep raw failures as well as successes. Freeze an evaluation set before tuning;
examples used to tune prompts are development cases, not blind quality evidence.
Synthetic speech and repeated fixtures are regression controls, not proof of
accuracy on live conversations. A feature inventory is not a functional test.
Report each gate as passed, failed or untested. Do not claim universal superiority
from a subset of passing gates.
