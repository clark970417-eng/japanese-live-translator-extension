# Stage 2 evidence: streaming recognition continuity

This report covers the streaming-continuity conditions named in
`CLAUDE-HANDOFF.md`. One measured failure was fixed, one remains open, and one
suspected failure was measured and dismissed.

## Provenance and limits of the condition set

`tests/corpus/continuity.json` defines ten conditions.
`scripts/generate-continuity-corpus.py` renders them with the macOS Kyoko voice
and transforms them locally with FFmpeg. Nothing is downloaded or redistributed.

These are authored controls for hunting failures. They are **not real livestream
speech**: one synthetic voice, a three-tone sine bed instead of music, and
attenuation instead of a distant microphone. The handoff asks for real speech,
and that part is not satisfied by this set.

| Condition | How it is produced |
| --- | --- |
| normal | Kyoko at rate 180 |
| fast | Kyoko at rate 280 |
| quiet | Kyoko at 180, `volume=0.06` |
| music | Kyoko at 180 mixed with a 294/370/440 Hz bed at 0.35 |
| pauses | speech, 2.5 s of silence, then more speech |
| exclamation | `あー！` |
| short | `はい！` |
| repetition | `やば、やば、やばい。` |
| silence control | 3 s of digital silence |
| music-only control | 3 s of the tone bed with no speech |

`scripts/benchmark-continuity.ts` replays each clip through the real pipeline in
the production window schedule and records every emission. Capture and VAD are
bypassed, so a stuck "listening" state caused by VAD gating cannot be observed
here; this measures what recognition itself produces.

## Measured failure: stock outro on audio without speech

The music-only control produced `ご視聴ありがとうございました` at 1176 ms and
held it across seven emissions, including a complete Chinese translation. Pure
silence produced nothing.

Probing the model directly explains why existing defences did not catch it:

| Clip | Peak amplitude | no_speech_prob | avg_logprob | Decoded text |
| --- | ---: | ---: | ---: | --- |
| music-only control | 0.037 | 0.0 | -0.11 | `ご視聴ありがとうございました` |
| silence control | 0.000 | 0.0 | -0.05 | `ご視聴ありがとうございました` |
| quiet speech | 0.018 | 0.0 | -0.09 | correct transcript |
| short reply | 0.255 | 0.0 | -0.17 | `はい。` |

Three conclusions follow from this table:

1. The bridge's guard `no_speech_prob > 0.6 && avg_logprob < -0.8` is dead code
   on this model. `no_speech_prob` is 0.0 even for digital silence.
2. What actually rejects pure silence is the bridge's amplitude gate at 0.00003.
   The music bed is far above it.
3. Amplitude cannot separate the two cases, because quiet speech at 0.018 sits
   **below** the music-only control at 0.037. Confidence cannot either: the
   hallucination is more confident than the genuine quiet transcript.

The phrase is the model's null output for audio without speech, so the only
available discriminator is the text. `isOutroArtifact` in
`src/engines/stt/transcript-guard.ts` rejects a transcript whose entire content
is one of seven known outro artifacts, and `MlxWhisperEngine` applies it after
the existing implausible-transcript guard.

`whisper-filter.ts` already held such a list but was only ever wired to
`WhisperLocalEngine`, never to the MLX path. It was not reused: it also contains
`ありがとうございます`, `よろしくお願いします`, `それでは` and `お疲れ様です`,
which are ordinary livestream speech, and 3.7.x deliberately decided against a
blanket ban on genuine greetings.

**Accepted cost.** A streamer whose entire utterance is exactly
`ご視聴ありがとうございました` loses that one caption. The same phrase inside a
longer sentence is kept, which the unit tests pin down.

## Result

| Condition | Before | After |
| --- | --- | --- |
| music-only control | 7 emissions, stock outro, translated | 0 emissions |
| silence control | 0 emissions | 0 emissions |
| eight speech conditions | recognized | identical transcripts |

First Japanese across the eight speech conditions moved from 636–1267 ms to
614–1227 ms, which is run-to-run variation, not an effect of the change.
Raw rows: `tests/results/continuity-baseline.jsonl` and
`tests/results/continuity-after.jsonl`.

## Suspected failure that measurement dismissed

The baseline showed up to nine emissions for four distinct source texts, which
looked like duplicate caption flooding. The recorded emissions show it is not:
each repeat carries the same Japanese with a longer or revised Chinese line,
which the caption window updates in place.

```
1267ms  今日は、いっ                         (no Chinese yet)
1318ms  今日は、いっ                         今天，是
1970ms  今日は一緒にゲームを                  (no Chinese yet)
2426ms  今日は一緒にゲームを                  今天，我們一起玩遊戲吧。
```

Japanese is published before its translation, which is what Stage 2 requires.
No deduplication change was made.

## Open failure

`あー！` is transcribed as `やら。` in both runs. It is represented as a single
caption with no flooding, so the flooding half of the gate holds, but the
content is wrong. The clip is 0.20 s of synthesized interjection, so this may be
a fixture artifact rather than a product defect. Classification: unresolved,
needs real speech before tuning. No change was made for it, per the handoff's
instruction to tune only from measured failures on real speech.

## Verification

554 desktop tests across 55 files, 70 extension tests, `tsc --build` clean,
production build clean. New unit coverage in
`src/engines/stt/transcript-guard.test.ts` pins whole-transcript rejection and
the survival of the same phrase inside a longer utterance, plus
`ありがとうございます` and `よろしくお願いします`.

## What is not established

- No real livestream speech, no multi-speaker audio, no real music recording.
- VAD and capture were bypassed, so the reported stuck-"listening" symptom is
  not covered by this report. It needs the browser capture fixture or an
  installed run.
- The gate's "short utterances are detected reliably" is supported only by two
  synthetic clips of 0.20 s and 0.25 s.
- No installed desktop or extension verification was performed.

## Companion socket path confirmation

The non-speech controls were replayed through the production companion over its
socket protocol, using the harnesses described in `RETEST-CONTENTION.md`, once
with the change removed by `git stash` and once with it restored.

| Control, caption events reaching the client | before | after |
| --- | ---: | ---: |
| music-only control | 12 | 0 |
| silence control | 0 | 0 |

Before the change, every one of the twelve caption events carried
`ご視聴ありがとうございました`, so the stock outro reached the caption stream
through the real native path, not only through the pipeline harness. After the
change no caption event is emitted for either control.

Raw rows: `tests/results/companion-path-before.jsonl` and
`tests/results/companion-path-after.jsonl`.

Still outstanding: VAD gating and tab capture are not in this path, and the
installed Opera check was not performed.
