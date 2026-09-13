# 3.8.11: integrated local HY-MT recovery, fidelity, and live-chat release

This release integrates the Stage 1-9 package and the later Bilibili, TikTok,
audio-startup and social-composer fixes from `origin/main` with the locally
completed spoken-outro, bounded companion-recovery, Japanese-to-Chinese
fidelity, decode-backlog and live-chat work. Website and chat translation stay
on the selected local HY-MT path in desktop mode; no network translator is
silently substituted while live captions run.

## Translation evidence

The frozen 24-item `translation-holdout-2.json` was created before the fidelity
candidate was run. The original HY-MT1.5 1.8B output passed 8/24 necessary-term
checks. The final 3.8.11 production worker passed 19/24, with a warmed median of
256 ms per text-only translation.

Manual review found that the five remaining automated failures express the
required meaning but use a synonym or a longer equivalent form: `或許` instead
of `可能`, `下週的星期六` instead of `下週六`, a correctly bounded past
`剛才還在睡覺`, `明天晚上` instead of `明晚`, and `有點不一樣` instead of
`不太一樣`. These are check artifacts, not evidence of five semantic errors.
This review is not blind or independent and does not establish general
superiority over another product.

The accepted source-aware rules cover livestream archives and clips, audio
drift, cooldowns, respawn points, network drops, hearsay, double negation,
permission, incomplete clauses and several common source-proven ambiguities.
They activate only when the matching Japanese evidence exists. Output repair
also removes observed leftover Japanese such as `切り抜き`.

Raw evidence: `tests/results/holdout-2-baseline.jsonl` and
`tests/results/holdout-2-final.jsonl`.

## Latency and continuity

The already accepted matched contention benchmark reduced the model queue age
for an audio operation from a 1219 ms median / 1243 ms maximum to 174 ms / 373
ms by letting arriving audio cancel optional written-draft repair. The first
complete draft remains available with a review warning. This addresses the
identified shared-worker cause, while an installed livestream remains the only
way to reproduce or retire the earlier 8.4-second field spike.

The extension now keeps a timed-out request from disconnecting unrelated work,
coalesces waiting final recording audio up to 20 seconds, throttles stale
previews, and supports two bounded worker recoveries with backoff. A third
failure stops with an actionable error; manual Start resets the recovery budget.

## Chat and site behavior

YouTube, Bilibili and TikTok limit restored live-chat history to the newest 20
visible messages and run at most three translations concurrently, newest first.
Duplicate in-flight text shares one request. This prevents a virtualized backlog
from filling the native queue ahead of current chat. YouTube/X and the social
site composer controls still create drafts for review and never submit them.

## Verification

- Extension: 104 tests passed.
- Desktop: 642 tests across 64 files passed.
- TypeScript check and production build passed.
- Frozen local HY-MT holdout: 19/24 automated checks; remaining five reviewed
  as equivalent wording, with the limitations above.
- Packaged macOS app: version 3.8.11, 7412 archive entries, source/runtime bytes
  matched, renderer assets present, code signature valid, native addon portable.
- `git diff --check` passed.

The user chose to reload the unpacked extension in Opera. No claim is made that
the installed browser copy has been accepted until that reload and livestream
smoke test are performed.
