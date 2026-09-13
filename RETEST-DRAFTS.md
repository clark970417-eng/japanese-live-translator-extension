# Stage 4 evidence: written Traditional Chinese to Japanese drafts

Platform terminology was fixed and shipped. The no-automatic-submission
requirement is verified and now pinned by a test. The gate as a whole is **not
met**: fixing the terminology on the handoff's named case exposed a subject
error in the same sentence.

## The frozen review set

`tests/corpus/draft-review.json`, 29 items, SHA-256
`b7db1f0cdc3a59e99b122eb0723d18d6f60bb8218c2189436d1437bbb2148be5`, authored and
frozen before any candidate output was observed.

| Surface | Items | Phenomenon | Items |
| --- | ---: | --- | ---: |
| YouTube comment | 11 | emoji preservation | 5 |
| livestream chat | 6 | line-break preservation | 4 |
| X reply | 5 | possibility | 5 |
| reply | 4 | negation | 7 |
| Shorts comment | 3 | names and handles | 2 |

One item, `known-possibility-negation`, is deliberately carried over from the
handoff so that the known case cannot regress silently. Every other Chinese
source string was checked against the 220 source strings in the existing
reports: no other overlap.

`scripts/benchmark-draft-review.ts` calls the production draft path, so
`translateWrittenDraft` and its uncertainty repair are included. Text only; the
composer UI and the browser are not covered. The `mustContain` terms are
necessary conditions, not a tone score, and every draft below was read.

## Baseline

HY-MT1.5 1.8B passed 24 of 29 automated checks. Three of the five failures were
the checks being wrong, not the drafts: `全く理解できませんでした` and
`おそらく` carry negation and possibility in forms my literal terms did not
list, and `今回は参加できないかもしれませんが、次回は必ず参加します。` is a
good rendering that one of my `mustNotContain` terms wrongly forbade.

Reading all 29 drafts found failures the checks did not catch:

| Item | Draft | Problem |
| --- | --- | --- |
| comment-archive-term | 仕事があるので、配信はできません | Says the writer cannot **stream**; the source says they cannot **watch** |
| known-possibility-negation | …配信の記録を見るつもりです… | `存檔` became `配信の記録`, the wording the handoff names |
| chat-archive-request | 保存ファイルに残して | `存檔` became a saved file |
| chat-cheer | 最後の一関が残りました | `一関` is not a Japanese stage counter |
| shorts-negation-request | 止まらないでください | `停更` became "don't stop moving" |
| shorts-name-handle | サクラのその… | The kana handle `さくら` was rewritten in katakana |
| reply-thanks | 返信をありがとう | Register slips out of the polite form mid-sentence |

Emoji survived in all five items that carry them, and line breaks survived in
all four multi-line items. Raw rows:
`tests/results/draft-review-baseline.jsonl`.

## Shipped: platform terminology for the draft path

`src/main/draft-glossary.ts` holds nine Chinese-to-Japanese platform terms, and
`extension-companion.ts` passes them on the `zh`→`ja` draft route only. Captions
are untouched. The occurrence filter from `RETEST-ACCURACY.md` applies, so a term
reaches the model only when the comment contains it. Ambiguous words such as
`卡` and `關` are deliberately excluded.

Measured effect: **0 of the 24 comments without a platform term changed.** The
five that contain one:

| Item | Result |
| --- | --- |
| comment-archive-term | fixed on both counts: `配信は見ることができません` and `アーカイブ` |
| known-possibility-negation | `アーカイブ` is correct, but see the regression below |
| chat-archive-request | `アーカイブ`; `這段` loses "part" |
| shorts-negation-request | meaning fixed; `更新停止しないでください` is still stiff |
| comment-future-plan | `配信開始` for `開台`; the odd `到着` remains |

Raw rows: `tests/results/draft-review-glossary.jsonl`.

## The regression this exposed

On the named case the shipped draft is now:

```
明日は来られないかもしれませんが、アーカイブを視聴しますので、無理にはしませんよ。
```

`無理にはしませんよ` says the **writer** will not overexert. The source asks the
**streamer** not to. The baseline had this clause right.

The cause is mechanical, not random. The baseline reached this sentence through
the 3.8.5 repair path, because its single-pass translation had lost the
uncertainty marker: `repaired` was true. With the terminology present, the
single pass already contains `かもしれません`, so the repair correctly does not
run, and that single-pass output is the one with the flipped subject.

No heuristic was added for it. Broadening the repair beyond a lost uncertainty
marker is what 3.8.5 rejected for producing false positives, and a subject flip
is a different failure class.

## Verified: nothing is ever submitted

`content.js` and `x-content.js` insert a draft with `execCommand('insertText')`
and one `InputEvent`, and neither file contains a `KeyboardEvent`, an Enter key,
or a `.click()` on a send control. A new test in `tests/composer.test.mjs`
asserts that a finished draft produces exactly one `InputEvent` on the editor
and that neither content script gains any submit-shaped call.

## Measured: Hy-MT2 7B on the same frozen set

| Frozen draft set, with terminology | 1.8B | 7B |
| --- | ---: | ---: |
| Automated checks passed | 25 / 29 | 24 / 29 |
| Median draft time | 294 ms | 1187 ms |

The check counts are almost equal and the differences are not: 7B is better
where it matters for this stage and worse in two specific ways.

7B gets the named case's subject right (`無理をしないでくださいね`) while
keeping `アーカイブ`, preserves the `さくら` handle, and replaces the nonsense
`最後の一関` with `最後のステージ`. Its register also reads warmer and less
mechanical, which is the voice this stage is aiming for. But it merged a
two-line comment into one line, dropped the hedge in
`這次我可能沒辦法參加` down to a flat `今回はできませんが`, and produced the
ungrammatical `参加できませんかもしれませんが` on the named case.

Drafts are typed comments, not live captions, and Stage 1 made them preemptible,
so roughly 900 ms more per draft is a much cheaper trade here than in the
caption path. Choosing the draft model separately from the caption model is a
product decision, so it is left as a recommendation. Raw rows:
`tests/results/draft-review-7b.jsonl`.

## Gate status

**Not met.** The gate requires the known possibility and negation case to pass
both semantic fidelity and tone review. With the shipped configuration it passes
the terminology and possibility requirements and fails on the subject of the
final clause. Without the terminology it fails on the wording the handoff
explicitly asked to replace. 7B satisfies both but adds a grammar error and
loses a line break elsewhere.

Remaining known failures on the frozen set with the shipped configuration: the
subject flip on the named case, the `さくら` handle rewritten as `サクラ`,
`最後の一関`, the stiff `更新停止しないでください`, the register slip in
`返信をありがとう`, and `到着` for joining a stream.

## What is not established

- Authored evaluation data reviewed by its author. No native-speaker review, no
  blind tone scoring, no real comments from the user's own channels.
- 29 items across five surfaces is a failure inventory, not a quality score.
- Text only. The composer insertion path is covered by unit tests, not by an
  installed browser run; Shorts, chat and X composers were not exercised live.
- The 7B comparison is one run per model on short comments with a warm worker.
- Codex MCP was unavailable for the design review that `.claude/rules` asks for;
  the shipped change reuses the existing glossary mechanism.

## Follow-up: subject reversal

`RETEST-DIRECTIVE.md` adds a request-to-the-reader fidelity property. The named
case now reads `…無理に自分を追い込まないでくださいね。` with no other draft on this set
changed. The gate above remains **not met** for the other failures listed, and
that report records a new one: the bare `存檔` terminology entry turns a game save
into a stream archive.
