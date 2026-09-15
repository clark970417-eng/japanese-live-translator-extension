# Context-aware stock-outro filtering

This change replaces the browser caption path's unconditional rejection of
stock outro transcripts with segment-bound speech evidence. A genuinely spoken
`ご視聴ありがとうございました` can now remain visible, while the same transcript
decoded from silence or music is still rejected.

## Baseline

`MlxWhisperEngine` previously rejected every exact stock-outro transcript. The
frozen ten-clip corpus therefore rejected all six spoken thank-you clips as well
as all four music-only hallucinations. `RETEST-OUTRO-CONTEXT.md` established the
rule before this implementation: keep an outro only when the extension's
production VAD measured at least 1.0 second at the speech-onset threshold.

## Implementation

- `SpeechWindows` records onset-threshold speech seconds for each emitted audio
  job.
- The value travels with that job through the offscreen worker, background
  service worker and native companion protocol.
- The companion validates that the value is finite, non-negative and no longer
  than the audio it describes. Invalid or missing evidence retains the previous
  safe behavior.
- Streaming and final recognition pass the evidence only to the matching audio
  chunk. Stop, segment replacement and reconnect clear or replace it together
  with that chunk.
- `MlxWhisperEngine` rejects a stock outro without sufficient evidence and keeps
  it when at least 1.0 second of speech was measured. Other transcripts are
  unaffected.

## Frozen-corpus result

The existing generated audio for `tests/corpus/outro-context.json` was replayed
through `SpeechGain`, Silero V5 and `SpeechWindows` using
`desktop-app/scripts/probe-production-vad.mjs`.

| Gate | Result |
| --- | --- |
| Spoken outro retained | 6 / 6 |
| Music-only outro rejected | 4 / 4 |
| Minimum spoken evidence | 1.54 s |
| Maximum music-only evidence | 0.13 s |

The generated WAV files were reused because regenerating them requires an
external FFmpeg executable that is not installed. Their manifest and decision
rule were already frozen before this implementation; no threshold was changed
after this replay.

## Verification

- Extension tests: 93 passed, including protocol validation and forwarding.
- Desktop tests: 638 passed across 63 files, including engine, streaming,
  segment association, Stop and reconnection coverage.
- TypeScript build passed.
- Production Electron build passed.
- `git diff --check` passed before commit.

## Remaining limitations

- The frozen corpus is synthetic, with one TTS voice. Real livestream speech,
  sung lyrics and background vocals still require installed Opera acceptance.
- Clients without speech evidence deliberately keep the old conservative
  behavior and reject exact stock outros.
- This change does not improve general recognition or translation accuracy.

