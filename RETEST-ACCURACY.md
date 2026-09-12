# Stage 3 evidence: Japanese to Traditional Chinese accuracy

One experiment was rejected, one robustness fix was kept, and the accuracy gate
itself is **not met** by the changes in this report. The strongest available
improvement is a model choice that belongs to the user, not to this session.

## The frozen holdout

`tests/corpus/translation-holdout.json`, 34 items, SHA-256
`bd1a333de1731c9cb84d74d7eb712f22649290785862f0ebe6c69e6a8a9c8310`.

It was authored and frozen **before** any candidate output was observed, and
every Japanese source string was checked against the 220 source strings that
appear in the existing `tests/results/` reports: zero overlap.

| Category | Items | Category | Items |
| --- | ---: | --- | ---: |
| negation | 4 | game | 4 |
| tense | 4 | names | 3 |
| uncertainty | 4 | pronoun | 3 |
| casual | 3 | reaction | 4 |
| incomplete | 2 | context | 3 |

Each item carries a reference translation, a stated intent, and `mustContain` /
`mustNotContain` terms. Those terms are **necessary conditions, not a score**: a
correct translation can fail them by choosing a synonym, and a wrong translation
can pass them. Every result below was reviewed sentence by sentence.

`scripts/benchmark-holdout.ts` sends text straight to the production local
translator, so recognition error cannot be counted as translation error. It is
authored evaluation data reviewed by the same agent that wrote it, which is not
an independent bilingual review.

## Baseline and its determinism control

HY-MT1.5 1.8B Q4_K_M passed 23 of 34 automated checks.

Two runs with identical settings produced **identical output for all 34 items**,
so this translator is deterministic here and every difference below can be
attributed to the change under test rather than to sampling.
Raw rows: `tests/results/holdout-baseline.jsonl` and
`tests/results/holdout-baseline-repeat.jsonl`.

Review of the 11 automated failures found 6 genuine translation errors and 5
cases where the check, not the translation, was wrong:

| Genuine failure | Output | Problem |
| --- | --- | --- |
| casual-contraction | 真的超討厭的啦，還是別繼續這樣做了吧 | `むずい` became dislike and `やっちゃお` became "let's not"; the meaning is inverted |
| game-archive | 請在後續的版本中再查看這個場景吧 | `アーカイブ` became a future version |
| game-cooldown | 技能的有效時間結束之後 | `クールタイム` became a validity period |
| game-revive | 回到回程點之後 | `リスポーン地点` became a return point |
| tense-future-plan | 下週的土曜日，我們預定會繼續這個話題 | `土曜日` left in Japanese, an invented "we", and an invented "topic" |
| unc-hearsay | 這個小技巧似乎真的很有用呢 | `らしい` is hearsay; `真的` adds an assertion |

The five check artifacts were `unc-maybe` (可能 for 說不定), `casual-shortened`
(馬上 for 現在, tone lost but meaning intact), `name-title` (leaves the title
untranslated, a defensible choice), `context-two-turn` (不要賣 for 不賣) and
`reaction-apology` (沒有聽到 for 沒聽到, which is correct).

## Rejected: a built-in terminology glossary

Three of the six genuine failures are stream and game loanwords, which the
handoff says to fix through general terminology handling. HY-MT receives
glossary entries as prompt terminology, so a candidate list of 25 terms was
written in `src/engines/translator/default-glossary.ts`.

Injecting all 25 terms into every request changed **23 of the 29 sentences that
contain no glossary term at all**, and inserted terminology that was not in the
source: `配信の切り抜き` came back as `直播存檔的精華剪輯`, naming an archive
nobody mentioned. That is invented content, which the gate forbids.

After the occurrence filter below, only the five sentences that actually contain
a term changed. Reviewed individually:

| Item | Result |
| --- | --- |
| game-archive | fixed: `直播存檔` |
| game-revive | fixed: `重生點`, though it invents "weapons and armour" |
| game-cooldown | **returned Japanese**: `技能の冷卻時間が終了したら、もう一度撃ちます。` |
| game-lag | no better: `電話線路` became the untranslated `回線` |
| neg-permission | neutral; the prohibition survives, `出す` still becomes "use" |

A single glossary term is enough to make this model answer in the source
language. The automated check passed that item because the Chinese term appeared
inside the Japanese sentence, which is exactly why the checks are not a score.

The list is therefore **not wired into production**. The file is retained,
marked as a rejected experiment, and imported only by the benchmark so the
result can be reproduced. Raw rows:
`tests/results/holdout-glossary.jsonl` (all terms) and
`tests/results/holdout-glossary-filtered.jsonl` (filtered).

## Kept: glossary terms are filtered to the sentence

`selectApplicableGlossary` in `src/engines/translator/glossary-utils.ts` keeps
only the entries whose source term occurs in the text, and `slm-worker.ts`
applies it when building the prompt.

This is a robustness fix for a shipped feature, not an accuracy gain. Any user
or organization glossary previously reached the model in full on every caption,
and the measurement above shows what that does: 23 of 29 unrelated sentences
changed, with terminology inserted into one. With the filter, sentences that
cannot use a term are byte-identical to no-glossary output. Users with no
glossary see no change at all.

Covered by `src/engines/translator/glossary-utils.test.ts`.

## Measured: Hy-MT2 7B on the same frozen set

| Frozen holdout, text only | HY-MT1.5 1.8B | Hy-MT2 7B |
| --- | ---: | ---: |
| Automated checks passed | 23 / 34 | 31 / 34 |
| Median translation time | 211 ms | 696 ms |

7B fixed five of the six genuine failures, including the inverted casual
sentence, the cooldown term, the respawn point, the hearsay assertion and
`土曜日`. It still renders `アーカイブ` as `檔案` rather than the stream archive.

The 696 ms median is far below the 2624 ms recorded in `RETEST-3.8.0.md`. These
sentences are short and the worker was warm, so the two numbers measure
different things; this is not evidence that 7B is cheap on long utterances.

The codebase already has adaptive routing with a configurable quality engine, so
routing final captions to 7B while interim stays on 1.8B is the obvious next
experiment. Changing that default trades against the latency work in
`RETEST-CONTENTION.md`, so it is left as a recommendation rather than a change.
Raw rows: `tests/results/holdout-7b.jsonl`.

## Gate status

**Not met.** No change in this report measurably improves translation accuracy
on the frozen set: the glossary experiment was rejected and the filter only
removes a perturbation that appears when a glossary exists. The failure
inventory above is the deliverable, along with the evidence that the 1.8B model
is the limiting factor for five of the six genuine errors.

Remaining known failures on the frozen set with the shipped configuration: all
six listed above. `game-archive` fails on both models.

## What is not established

- Authored evaluation data, reviewed by its author. No independent bilingual
  review, no blind scoring, no real livestream transcripts.
- 34 sentences is a failure inventory, not a quality score.
- Text only. Recognition error, caption timing and the browser path are excluded.
- The 7B comparison used short sentences and a warm worker in one run each.
- `.claude/rules/behavior.md` asks for a Codex MCP design review. Codex MCP was
  unavailable in this session; the documented fallback was used, and the kept
  change reuses the existing glossary mechanism rather than adding a pattern.
