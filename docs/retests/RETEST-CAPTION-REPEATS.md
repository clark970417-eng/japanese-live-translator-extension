# Repeated caption events

Task: remove the byte-identical repeated caption events observed in the soak,
while preserving legitimate repetition in separate speech segments.

**Result:** every same-segment repeat is gone over the real companion socket,
no other caption event changed, and the same words in separate segments are
still delivered.

## What the soak figure actually counted

`RETEST-SOAK.md` reported 1010 emissions repeating a caption's Japanese and
Chinese across 477 utterances. That metric compared captions across all decode
windows of one utterance. The browser sends every window as its own segment, so
a hypothesis carried from one window to the next was counted as a repeat. That
carry-over is legitimate: each window is a separate caption update for the
extension. The redundant events are the narrower set measured below.

## Definition

A caption event is redundant when, for the **same segment**, it repeats exactly
what the previous event for that segment said: Japanese, Chinese, target
language, speaker, and interim or final state. Only its timestamp may differ.
The same words under a different segment are a new caption.

## Baseline

`scripts/measure-caption-repeats.mjs` records every raw caption event from a
fresh companion host over seven utterances, including two authored clips each
replayed as two separate segments so legitimate cross-segment repetition exists.

| Baseline | Value |
| --- | ---: |
| Caption events | 56 |
| Segments | 15 |
| Redundant repeats, same segment | 6 |
| Of those, byte-identical including timestamp | 4 |
| Gap to the previous event, median | 0 ms |
| Gap to the previous event, max | 17 ms |
| Caption contents appearing in more than one segment | 6 |

All six repeats were interim events. Four carried the same timestamp as their
predecessor, meaning the same pipeline result was emitted twice.

The gap matters. On the desktop path in single-caption mode, `background.js`
gives every caption event a fresh `expiresAt`, so repeats currently extend how
long a caption stays on screen. Because every repeat arrived within 17 ms of the
event it repeated, suppressing them shortens that by at most 17 ms.

## Change

`captionFor` in `src/main/extension-companion.ts` remembers, per segment, the
last caption it sent without the timestamp, and skips an event identical to it.

- The comparison is only against the last event for that segment, so a change
  followed by a return to earlier content is sent both times.
- The timestamp-to-segment map used by recognition corrections is updated before
  the check, so a correction naming a suppressed repeat's timestamp still finds
  its segment.
- The map is bounded to 100 segments and cleared on `stop`.
- Error captions and corrections are sent as before.

## Tests

`src/main/caption-dedupe.test.ts`, five tests through the socket protocol:

| Test | Without the change | With it |
| --- | --- | --- |
| a result repeated for one segment is sent once | fails | passes |
| the same words in a different segment are sent again | passes | passes |
| every change is sent, including a return to earlier content | passes | passes |
| a final caption is sent even when its words match the last interim | passes | passes |
| a correction naming a suppressed repeat's timestamp is routed | fails | passes |

The three that pass either way are the over-suppression guards. Desktop suite
588 passed; `tsc --build` clean.

## Measured result

| Same harness | Before | After |
| --- | ---: | ---: |
| Caption events | 56 | 50 |
| Redundant repeats, same segment | 6 | 0 |
| Byte-identical repeats | 4 | 0 |
| Caption contents appearing in more than one segment | 6 | 6 |

For all 15 segments, the sequence of caption contents after the change is
exactly the baseline sequence with consecutive same-segment repeats removed.

Raw rows: `tests/results/caption-repeats-baseline.jsonl`,
`tests/results/caption-repeats-after.jsonl`.

## Regressions

None measured. The behavioral difference is the at-most-17 ms shorter expiry in
single-caption mode described above.

## Remaining limitations

- Seven utterances, one run. The soak's hour was not rerun with this change, as
  instructed.
- The underlying cause, one pipeline result emitted twice, is suppressed at the
  companion boundary rather than removed inside the streaming processor.
- Only the desktop companion path is covered; the browser-only recognition path
  has its own expiry rule and is unchanged.
