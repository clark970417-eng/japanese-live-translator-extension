# Written drafts: requests addressed to the reader

Task: stop requests such as `不要勉強自己` from becoming "I will not overexert
myself" in Chinese-to-Japanese drafts, with a general semantic-fidelity rule and
no whole-sentence replacement.

**Result:** the reversal is fixed on the frozen set and on the Stage 4 set, with
no other draft changed. The Stage 4 gate is still **not met**; see the last
section.

## Frozen evaluation set

`tests/corpus/draft-directive.json`, 20 items, SHA-256
`d71a58e36e5e39931ad9ed44543588030b85fd237e453592151eccf3ccb93a80`, frozen and
hash-recorded before any candidate output existed, and re-verified by hash
immediately before each run.

| Group | Items | What a correct draft must do |
| --- | ---: | --- |
| addressee | 10 | carry a request form aimed at the reader, and not a writer-self form |
| self | 5 | stay a statement about the writer; must not become a request |
| trap | 5 | look-alike words (`不要緊`, `別人`, `不用謝`, `請問`, `特別`); no request inserted |

Every item uses `mustContainAny` / `mustNotContainAny` terms written with the
set. One item, `anchor-handoff-case`, is the Stage 4 regression carried over on
purpose; the other 19 overlap with no earlier set or report.

## Baseline

The shipped draft path (HY-MT1.5 1.8B, draft terminology, 3.8.5 uncertainty
repair) passed 19 of 20. The one failure was the anchor:

```
明日は来られないかもしれませんが、アーカイブを視聴しますので、無理にはしませんよ。
```

The cause, established in `RETEST-DRAFTS.md`: the single-pass draft kept
`かもしれません`, so the uncertainty repair correctly did not run, and nothing
checked the subject of the final clause.

Reading all 20 baseline drafts found no other subject reversal. It did find a
defect outside this task, recorded below.

## Change

`src/main/draft-fidelity.ts` now checks a list of fidelity properties instead of
uncertainty alone. A property is lost when some clause carries it in the Chinese
and the whole Japanese draft has none of its forms. Any lost property triggers
the existing clause-by-clause retranslation, and the clause that carries a lost
property must carry it again or the repair is rejected.

The new property is a request, prohibition or reminder addressed to the reader:

- Source signals `不要`, `別`, `請`, `記得`, each excluding look-alikes:
  `不要緊`, `不要臉`, `別人`, `別的`, `特別`, `請問`, `請假`.
- A clause whose subject is the writer (`我`, `我們`) is not a request.
- Japanese forms include `ないで`, `ないように`, `ずに`, `てください`,
  `てね`, `なくていい`, `ように`, `ましょう`, and the voiced `で` variants.

Uncertainty keeps the 3.8.5 rule exactly, including the requirement that it sit
in the first clause, so this change cannot widen that repair. Preemption, the
1800 ms deadline, the two-to-three clause limit and the unsafe-split rules are
unchanged.

## Tests

- New unit tests in `src/main/draft-fidelity.test.ts`: the reversal is repaired
  clause by clause; six writer-self and look-alike sources are left alone with a
  single model call; a repair whose request clause still is not a request keeps
  the original draft with a warning; an already-correct request is untouched;
  three voiced te-form requests are accepted.
- `src/main/companion-contention.test.ts`: its fake translator answered the
  request clause with `はい。`, which the new property correctly refuses to accept
  as a repair. The fake now returns a request form for that clause, and the test
  additionally asserts the repaired draft contains it.
- Desktop suite 569 passed; `tsc --build` clean.

## Measured result

| Frozen directive set | Baseline | Change |
| --- | ---: | ---: |
| Checks passed | 19 / 20 | 20 / 20 |
| addressee | 9 / 10 | 10 / 10 |
| self | 5 / 5 | 5 / 5 |
| trap | 5 / 5 | 5 / 5 |
| Drafts changed | — | 1 |
| Review warnings raised | 0 | 0 |

The anchor now reads:

```
明日は見ることができないかもしれません。でも、配信のアーカイブを見るつもりです。無理に自分を追い込まないでくださいね。
```

The other 19 drafts are byte-identical to the baseline. No self or trap item was
repaired or warned.

Regression check on the Stage 4 set (`tests/corpus/draft-review.json`): 25 of 29
before and after; only `known-possibility-negation` changed, and it changed in
the same way.

## Regression found and fixed during the change

The first candidate raised a review warning on an untouched, correct Stage 4
draft, `どうぞゆっくり休んでください`. The request regex accepted `てください`
but not `でください`, and Japanese voices `て` to `で` after `ん`, `ぐ`, `ぶ`,
`む` and `ぬ`. The regex now accepts both, with a test for three voiced forms.

This was found on the Stage 4 set, which served here as a regression check, not
as the evaluation of this change. The frozen directive set was rerun after the
fix and stayed at 20 of 20 with no warnings. Both intermediate reports are kept:
`tests/results/draft-directive-candidate.jsonl` and
`tests/results/draft-review-directive-fidelity.jsonl`.

## Defect found outside this task, not fixed here

`self-forgot` (`我剛剛忘記存檔了`) came back in both runs as
`アーカイブをちょうど忘れてしまいました`. Here `存檔` is a game save, and the
Stage 4 draft terminology maps the bare word `存檔` to the stream archive. The
terminology entry is too broad. It was not changed in this task: it was observed
on this frozen set, and changing the terminology and then reporting the same set
as evidence would be tuning on the holdout.

## Remaining limitations

- A clause whose writer appears only as an object, such as `請不要等我`, is
  treated as writer-subject and not checked. That errs toward no repair.
- `ように` also appears in non-request phrases, so a draft can look like it
  carries a request when it does not. That errs toward no repair.
- Repair is still limited to two or three short comma-separated clauses. A
  reversal inside a single clause or in a longer comment is not repaired; it is
  not warned either unless the whole draft lacks every request form.
- Authored evaluation data reviewed by its author. No native-speaker review.

## Stage 4 gate

**Still not met.** The named possibility-and-negation case now passes semantic
fidelity. Its first clause, `明日は見ることができないかもしれません`, is correct but
stiff rather than warm. The other Stage 4 failures remain: the `さくら` handle
rewritten as `サクラ`, `最後の一関`, the stiff `更新停止しないでください`, the register
slip in `返信をありがとう`, and now the `存檔` terminology defect above.

Raw rows: `tests/results/draft-directive-baseline.jsonl`,
`tests/results/draft-directive-candidate-final.jsonl`,
`tests/results/draft-review-directive-fidelity-final.jsonl`.
