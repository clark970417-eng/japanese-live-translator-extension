# 3.9.3 recovery, selector and load verification

This revision targets the user's Apple M5 Mac and Opera GX workflow. It does
not claim compatibility on untested computers.

## Changes

- Live-caption work may clear two normal six-window utterances before written
  page translation receives the shared worker. This keeps a page translation
  from landing between the interim and final decode while retaining a bound on
  text starvation.
- YouTube, TikTok and Bilibili chat discovery now falls back to semantic live
  regions and their smallest Japanese text leaves. This survives site class-name
  changes and avoids translating account-name metadata.
- The soak harness now kills Electron and all model descendants during a forced
  restart. It also clears request timers and identifies duplicate events by
  segment, eliminating orphan workers and false duplicate counts in future runs.

## Long-session candidate run

The production companion handled 88 utterances, 29 Chinese-to-Japanese drafts,
17 Stop/Start cycles, 22 silence/music controls and two forced host restarts over
603 seconds. Both restarts resumed successfully with one host process. There
were zero blank finals, missing finals, stale captions after Stop or request
errors. Silence and music produced no text.

| Measurement | Result |
| --- | ---: |
| Queue age p50 / p95 / max | 728 / 1808 / 2990 ms |
| Final delay p50 / p95 / max | 1605 / 3402 / 6947 ms |

The raw run is `desktop-app/.test-out/soak-3.9.3-candidate-10m.jsonl`. Its old
`duplicates` field is not used: that version of the harness counted legitimate
rolling revisions with identical text. The corrected harness keys repeats by
segment.

## Matched LiveTranslate replay

The fork and pinned upstream `3d333e6` replayed the same JSUT audio sequentially
with the same MLX Whisper and HY-MT1.5 weights. Capture, VAD, browser messaging
and rendering are outside this engine-only comparison. Nineteen paired trials
had valid monotonic timing; the twentieth upstream trial experienced a system
clock/suspension discontinuity and is excluded from latency statistics. Both
sides still have identical 8.17% recognition CER on all 20 transcripts.

| Engine-only measurement, 19 paired trials | Fork 3.9.3 | Upstream |
| --- | ---: | ---: |
| First Japanese median / p95 | 1170 / 1992 ms | 1823 / 9229 ms |
| First Chinese median / p95 | 1245 / 2103 ms | 3917 / 10725 ms |
| Final delay median / p95 | 850 / 1587 ms | 8115 / 11436 ms |
| Valid-run maximum final delay | 7598 ms | 16689 ms |
| Missing finals | 0 | 0 |

The fork rejected both silence controls. Upstream produced “Thank you.” on the
first and rejected the second. Raw data is in
`tests/results/stage10-fork-393.jsonl` and
`tests/results/stage10-upstream-393match.jsonl`.

## Installed application and Opera smoke run

The signed 3.9.3 application in `/Applications` was configured for the intended
low-latency path: MLX Whisper, HY-MT1.5 and an 800 ms streaming interval. The
companion handshake reported `mlx-whisper + hunyuan-mt-15`. Three installed-app
contention trials completed with Chinese-to-Japanese page work running beside
Japanese-to-Chinese captions. The median audio-window round trip was 1417 ms
and the maximum was 1885 ms. No caption was blank or reordered. Both silence
and music controls produced no text, Stop emitted no late captions, and a new
request after Stop succeeded.

Opera GX now loads extension version 3.9.3 from this repository. Its service
worker is active and the YouTube, TikTok and Bilibili permissions are present.
The selector fallbacks are covered by the extension test suite; posting a live
chat message was intentionally not part of the smoke run.

Raw installed-app results are in `tests/results/installed-393-smoke.jsonl`.

## Remaining limits

One fork utterance still had a 7.6-second final-delay outlier. Translation
quality is not scored by the Japanese recognition references. Live-site markup
can change after release even with semantic selector fallbacks. The evidence
supports better latency on this corpus and the tested Apple M5/Opera setup, not
universal superiority for every voice, stream, computer or optional engine.
