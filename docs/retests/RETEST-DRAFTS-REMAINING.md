# Stage 4 follow-up: the remaining Chinese-to-Japanese draft defects

Task: fix the defects `RETEST-DRAFTS.md` and `RETEST-DIRECTIVE.md` left open by
their general causes, not by replacing benchmark sentences. Judge each change
against a new frozen set, the existing Stage 4 sets, and an unseen validation
set, and report semantic fidelity and tone separately.

**Verdict: five changes accepted, two variants rejected. Stage 4 is not
complete.** The automated checks improved on every set with no check regressing.
Reading every output found one new omission, which is disclosed below, and
several semantic errors that no change here addresses. No independent
native-speaker review has been done, and Stage 4 must not be declared complete
without one.

## Evaluation data, frozen before any candidate output

| Set | Items | SHA-256 | Role |
| --- | ---: | --- | --- |
| `tests/corpus/draft-stage4-remaining.json` | 36 | `2b898a20…dde834a87` | Development: save vs archive, kana names, stage counters, "don't stop updating", register, writer vs reader, negation, possibility, emoji, line breaks, traps |
| `tests/corpus/draft-review.json` | 29 | existing | Unrelated drafts, regression control |
| `tests/corpus/draft-directive.json` | 20 | existing | Request-subject regression control |
| `tests/corpus/draft-stage4-validation.json` | 33 | `1574a41d…02f88541` | Unseen: written and committed (`46c043d`) after all changes were final, before either build ran on it |

Neither new set shares a source sentence with any earlier set or with each
other. The development set was committed alone (`a278f0b`) before any change.

Controls:

- The model is deterministic. Both existing sets reproduced the last committed
  runs byte for byte before work began.
- The validation baseline ran from a worktree at `e8bf67e`, the pre-task
  source. It reproduced the development baseline for `draft-review.json` on 29
  of 29 drafts.

The checks are necessary conditions written before output was seen. They are
not scores, and each output was also read against its source.

## Accepted changes

| Commit | Change | General cause it addresses |
| --- | --- | --- |
| `9a42992` | `selectDraftTerminology` picks terms per comment. `存檔` gets `アーカイブ` only with watching or stream evidence, `セーブ` only with play evidence, and **no term** when neither side wins. Stage counters (`最後一關`, `這關`, `第N關`) get `ステージ`, excluding `關係`, `開關` and similar. `機關` becomes `ギミック` only next to a stage. | A bare `存檔 → アーカイブ` entry forced every save into an archive; with no stage term, the model read `一關` as a place name. |
| `4365f17` | After drafting, a kana run from the source that comes back in the other script is written back as the source wrote it. Only an exact script flip of a two-or-more-character source run is restored. | The model normalises hiragana handles to katakana: `さくら` became `サクラ`. |
| `e806e94` | If a draft of two to four written lines comes back with a different number of lines, each line is translated on its own. This runs under the existing 1800 ms repair deadline and live-audio preemption. On failure the first draft is kept with a warning. | Multi-line comments were merged or truncated: `週末可能會晚一點開台⏎但一定會來` became `配信開始`. |
| `fae6094` | Within one sentence, a bare `ありがとう、` becomes `ありがとうございます、` when the sentence ends politely. | Mixed register inside a single sentence. |
| `f2610f1` | When a prohibition directly precedes `停更` (`不要停更`, `別停更`), the request form `更新をやめないで` is offered *instead of* the noun `更新停止`. | With only the noun on offer, `不要停更啦 🥺` became `更新を停止しません 🥺`, a statement from the writer. |

Tests: 8 terminology tests in `src/main/draft-glossary.test.ts`, which is new.
`src/main/draft-fidelity.test.ts` went from 23 to 36 tests. The new ones cover:

- Kana restoration.
- Line repair: the merged case, a matching count, blank lines, preemption, the
  four-line bound, a line that splits, the deadline, and preemption mid-repair.
- Register: raised only in a polite sentence, and never touched in a casual or
  already-polite one.

## Rejected experiments

| Label | What it tried | Why rejected |
| --- | --- | --- |
| E1 | Terminology as in `9a42992`, plus `停更 → 更新をやめる` and identity terms for every kana run | Damaged unrelated drafts. `不要停更啊，我每天都在等` lost its request. A trap statement changed agency. The identity terms perturbed tone: a lost `ね`, and a doubled thanks on the `みこ` item. `這段可以留在存檔裡嗎` fell back to `保存ファイル`. It was split into the accepted `9a42992` and `4365f17`. |
| E4 | Request form for `不要停更` added *alongside* `停更 → 更新停止` | Fixed both targets but broke an unrelated draft: `不要停更啊，我每天都在等` became `更新をやめないでください。⏎更新停止です。`. That drops "I wait every day", invents a sentence and adds a line. Replaced by `f2610f1`, which removes the conflicting noun. |

Raw rows: `tests/results/s4r-<set>-e1-terminology.jsonl` and `s4r-<set>-e4.jsonl`.

## Results

Checks passed, from the pre-task build to the final build (`f2610f1`):

| Set | Before | After | Checks newly failing | Review warnings |
| --- | ---: | ---: | ---: | --- |
| Development, 36 | 25 | 35 | 0 | 2 → 0 |
| `draft-review`, 29 | 25 | 26 | 0 | 0 → 0 |
| `draft-directive`, 20 | 20 | 20 | 0 | 0 → 0 |
| **Unseen validation, 33** | **21** | **29** | **0** | 1 → 0 |

On the unseen set, 10 drafts changed. They fall into two groups:

- **Nine are clear improvements:**
  - Three game saves no longer read `アーカイブ`.
  - A document save no longer reads `アーカイブを保存`. `記得把文件存檔` gets no `存檔` term, as intended.
  - `ペコラ` became `ぺこら`.
  - `第五関` became `ステージ5`, and `その関` became `あのステージ`.
  - `最後のクリアポイントまで2時間残り` became `最後のステージが2時間も続きました`. This is still imprecise, see below.
  - `更新を止めないで` became `更新をやめないで`, which is equivalent.
- **One is mixed:** `希望你不要停更，一直做下去` changed from the garbled but complete
  `更新停止については、どうか続けてほしいです。ずっと続けてください。` to the natural
  `更新をやめないでください`. The new draft **omits "keep going"**. That is a real
  omission introduced by `f2610f1`, low in severity because the dropped clause
  repeats the request, but it is not faithful.

Latency per draft, 7B with a warm worker:

| Set | Median | P95 | Max |
| --- | --- | --- | --- |
| Development | 234 → 278 ms | 388 → 414 ms | 449 → 592 ms, line repair |
| `draft-review` | 299 → 308 ms | 634 → 638 ms | — |
| Validation | 278 → 285 ms | 402 → 415 ms | — |

Line repair ran on one development item (577 ms). On each existing set the
existing clause repair ran once, on the same item as before. Drafts are not on
the caption path, and the 7B draft model is still used only when no caption
session runs.

## Semantic fidelity, final build, from reading every output

Errors that remain, whether or not a check caught them:

| Item | Draft | Error |
| --- | --- | --- |
| `v-subject-reader-no-thanks` `你不用謝我啦` | `ありがとうございません。` | Nonsense; meaning lost. |
| `v-subject-writer-not-watching` `我今天不會看直播…` | `今日は配信をしないので…` | "I won't watch" became "I won't stream". **The check passed.** |
| `v-register-sorry-late` `抱歉這麼晚才回覆你` | `遅くなってしまいましたが、返信します。` | The apology is dropped. |
| `save-game-forgot` `我打到一半忘記存檔…` | `セーブの途中で忘れてしまい…` | "Forgot to save midway through playing" became "forgot while saving". **The check passed.** |
| `v-save-slot` `第二個存檔欄位被覆蓋了` | `第二のセーブ欄が埋まってしまいました` | "Overwritten" became "filled". The term is right; the verb is wrong. |
| `v-stage-last-stuck` `最後一關卡了兩個小時` | `最後のステージが2時間も続きました` | Being stuck is lost. |
| `name-two-handles` `和さくら、ねね一起…` | `和さくら、ねねと一緒に…` | The Chinese `和` ("with") is kept as if part of the name. **The check passed.** |
| `v-keep-updating-hope` | `更新をやめないでください` | The omission described above. |
| `fidelity-maybe-late-two-lines` | `…かもしれません⏎しかし、必ず来るでしょう` | `でしょう` slightly weakens "definitely". |

Check artifacts, where the draft is correct and the check too narrow:

- `subject-reader-no-apology`: `謝罪する必要はありませんよ`.
- `v-trap-unrelated`: `関与はありません`.
- `v-register-cheer-match`: `応援しています`.
- In `draft-review`, the three failures open since `RETEST-DRAFTS.md`:
  - `理解できませんでした` carries the negation.
  - `おそらく` carries the uncertainty.
  - `次回は必ず参加します` is the intended promise.

The frozen checks were not edited.

## Tone, final build, reported separately

- **Register is mostly polite and respectful, but not uniform across drafts.**
  Some drafts stay plain, such as `いつも頑張ってくれてありがとう` and
  `誕生日おめでとう！…応援します`. That is consistent within the sentence and
  acceptable for a fan comment, but no rule enforces one register across a
  whole draft. The accepted register fix covers only the within-sentence
  `ありがとう、` pattern.
- **Cute tone is rare.** `ね`/`よ` endings appear in a minority of drafts, and
  none of these changes adds them. The stage terms removed `ね` from
  `このステージの魔王はとても難しいです`.
- **Stiff or unnatural wording remains:**
  - `しかし、` in a casual two-line comment.
  - `おやすみです`.
  - `最後のステージが残りました`.
  - `配信、今日は多くの人がいます`.
  - `ルナの歌に感謝します`.
  - `あなた` in `今日はあなたが私たちと一緒にいてくれてありがとう`.
- **Improved:**
  - `更新をやめないでください` replaces the ungrammatical `更新停止しないでください`.
  - `セーブを忘れずにね` replaces `アーカイブをしておきますよ`.

## What is not established

- **No independent native-speaker review.** The evaluation sentences, checks and
  review were all written by the same author. The semantic and tone judgments
  above are that author's reading. Stage 4 cannot be declared complete until a
  native Japanese speaker reviews the development and validation outputs blind.
- One model, one run per build, short authored comments, no real comments from
  the user's channels.
- The context rules for `存檔` and `停更` are small hand-written evidence lists.
  Comments phrased outside them get no term, which falls back to the model's
  choice rather than to a wrong term, but that choice is not guaranteed.
- Line repair is verified on text only; the composer insertion path is unchanged
  and was not exercised in a browser.

Raw rows:

- Development and existing sets, per build:
  `tests/results/s4r-<set>-{baseline,e1-terminology,e1a,e1b,e2e3,e4,e4a}.jsonl`.
  `e4a` is the final build.
- Validation: `tests/results/s4v-{baseline,candidate}.jsonl`.
- Baseline control: `tests/results/s4r-draft-review-basecontrol.jsonl`.
