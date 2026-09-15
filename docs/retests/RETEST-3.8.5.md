# 3.8.5: bounded uncertainty repair for written Japanese drafts

This release addresses a narrow failure observed through the installed Opera extension: a Chinese comment containing “可能” was translated as definite inability. It does not fix general negation, tense, recognition errors, or high-load speech latency. The local model and production translation prompt are unchanged.

## Changed behavior

Complete Chinese-to-Japanese written drafts first use the existing translator. If the source contains a positive possibility marker (可能, 也許, 或許) and the Japanese draft lacks a recognized uncertainty expression, a conservative guard considers retranslation. It accepts only two or three short clauses with an uncertainty-bearing first clause; conditions, quotes, long text and other unsafe structures are excluded. The first retry must preserve uncertainty before the remaining clauses are translated. The joined draft replaces the initial result only after every part succeeds.

The optional repair has a 1.8-second cancellation deadline. The signal reaches the production worker; this is not a timer that merely abandons running inference. Worker cancellation acknowledgment can add up to the existing recovery grace period. On failure the completed original draft is retained with a specific review warning, without an unbounded retry or an empty reply. Ordinary definite statements and sources containing 不可能 are not treated as positive possibility. The ambiguous quantifier 不一定 is excluded from this first implementation.

Only the extension's written zh→ja request path uses this guard. Live Japanese→Chinese speech processing, shared model selection, automatic phrase translations and user settings are unchanged. The guard is a limited linguistic heuristic, not a general semantic validator: it can miss negation loss and cannot prove that the rest of a draft is correct.

## Development experiments

- Removing all grammatical glossary hints regressed tense and politeness; reverted.
- Adding an explicit uncertainty prompt did not fix the observed comment and caused one output-limit error; reverted.
- Unconditional punctuation splitting caused a conditional fragment to exceed its output limit; rejected.
- Retrying a leading clause plus the entire remainder preserved uncertainty but changed the recipient of reassurance; rejected.
- The accepted bounded two/three-clause fallback preserved possibility and the recipient in the reported case. The other 11 development outputs remained on their original path.

For the reported comment, the earlier output was “明日はできませんが…”; the accepted output is “明日は見ることができないかもしれません。でも、配信の記録を見るつもりです。無理に自分を追い込まないでくださいね。” This fixes the specific lost uncertainty; “配信の記録” is still less idiomatic than “アーカイブ.”

The final actual-worker run completed the repaired comment in 1487 ms. This is a quality/latency tradeoff, not a speed improvement: ordinary drafts avoid extra model calls, but this damaged draft requires more work. Measurements are warmed text-only processing and exclude browser capture, STT, cold model loading and independent quality assessment.

## Separate cases and limits

Sixteen cases were frozen before the first guard evaluation. They exposed two false-positive warnings for 不一定, so the guard was narrowed. The subsequent 16-case run is therefore a regression rerun, **not a fresh holdout claim**. All 16 final strings matched baseline, with no warning or request error. No repair fired in that set; it establishes unchanged behavior there, not broad repair effectiveness. One baseline still loses a negation (“可能不是第一個”); this possibility-only guard does not catch it.

All raw development, rejected-candidate and final results are retained under `tests/results/stage14-*`; input manifests are under `tests/fixtures`. Developer interpretation of those outputs is not a blinded bilingual quality rating or a matched upstream comparison.

## Verification and installation

- 550 desktop tests across 53 files; 70 extension tests; TypeScript and production build passed.
- Tests cover bounded repair calls, preservation of a successful draft on error, positive/negative possibility distinction, unsafe splits and actual abort-signal delivery at the deadline.
- Packaged and installed desktop 3.8.5 passed runtime-byte, renderer-asset, code-signature and native-addon portability verification (6942 archive entries).
- All 26 installed extension files match 3.8.5. The previous installed desktop bundle is preserved as a rollback copy.

## Installed Opera runtime

Opera's extension manager showed 3.8.5 after reload. The first browser draft test accidentally reached the pre-update desktop process and reproduced the old definite translation; this confirmed that replacing application files does not restart an already running process. After quitting that exact process and letting the extension launch the installed 3.8.5 companion, the reported comment produced the repaired possibility-preserving draft in 1448 ms.

The test was repeated while live Japanese audio captions were running. The repaired draft returned in 2966 ms and new bilingual caption groups continued to appear, with no dropped or resynchronized audio. The rolling diagnostics later showed processing P50/P95 868/1868 ms, queue P50/P95 109/926 ms, two pending segments, and a latest audio-end-to-Chinese value of 8412 ms during Stop/drain. Stop eventually cleared the queue and returned the popup to Ready.

That 8.4-second spike is a failed latency target. It shows that sharing one inference worker between a multi-call written-draft repair and live captions can still delay speech work despite scheduler priority. Version 3.8.5 is therefore verified for the narrow written-draft correctness fix and recovery to Ready, but it is not a latency improvement or proof of superiority over LiveTranslate. Separating or preempting written repair work is the next performance task.
