# Investigation: context-aware rejection of the stock outro

Task: investigate replacing the unconditional exact-outro block with a
context-aware method that keeps genuine spoken thanks while still suppressing
music-only hallucinations.

**Outcome:** one candidate failed, one passed on a frozen set, and the passing
one also showed that on the browser path the exact block is guarding against a
hallucination the extension's own VAD already prevents. No production code was
changed. The exact block stays until the recommended change below is built and
measured.

## Method discipline

Two separate data sets were used so that nothing was tuned on its evaluation:

- **Calibration**: the Stage 2 continuity clips, already used in
  `RETEST-CONTINUITY.md`.
- **Evaluation**: `tests/corpus/outro-context.json`, 10 new authored clips, SHA-256
  `3ae259fccb25a353b4e2e4d8ee6e633e58e45c15c666148856869737198f26de`, frozen before
  any feature was computed on it.

Each decision rule and threshold was written to `tests/corpus/outro-rule.json`,
hash-recorded, and only then applied to the evaluation set. The file was frozen
twice: with the first rule alone at SHA-256
`87c9a26600590cd96a9e528a43e4aa9359e68cd0f11b2e75f77cb99da2c05758`, and after the
second rule was appended at
`eb71b9008f7dedbfc09d41fb3e6f84cc738827c04c5bb58ce04245a40e620c60`, which is the
committed version. Appending rewrote the file, so only the second hash matches it;
the first rule's fields are unchanged inside it. The pass criterion
was fixed with the rule: every spoken-thanks clip kept, every music-only outro
hallucination rejected.

| Evaluation clip | What it is |
| --- | --- |
| thanks-normal, -slow, -fast | `ご視聴ありがとうございました` at rates 180, 150, 240 |
| thanks-quiet | the same at 8% volume |
| thanks-over-music | the same over a chord bed |
| watch-thanks-short | `ご覧いただきありがとうございました` |
| music-chords | alternating triads, no speech |
| music-rhythm | noise hits and a decaying kick every 0.5 s |
| music-melody | a pitch step every 0.25 s, near a syllable rate, on purpose |
| music-full | chords, melody and rhythm together |

Every clip is synthetic: one TTS voice and generated music. No real recording was
used, which is the main limit of this investigation.

## Baseline

Whisper decoded all ten clips as the stock outro. The exact block therefore
rejects all ten: it suppresses the four hallucinations and also discards all six
genuine thank-you captions.

## Candidate 1: syllable-rate envelope modulation — failed

Speech amplitude rises and falls at roughly the syllable rate, so the share of
energy-envelope modulation in 2-8 Hz was measured.

Calibration found speech clips of at least one second between 0.53 and 0.81 and
the two known hallucinations at 0.000 and 0.003. Pitch glide failed on quiet
speech, and Whisper's word coverage and word probability overlapped between
speech and hallucination, so those were set aside. The frozen rule rejects an
outro when modulation is below 0.25.

| Evaluation | Modulation | Rule |
| --- | ---: | --- |
| six spoken-thanks clips | 0.626-0.823 | all kept |
| music-chords | 0.187 | rejected |
| music-melody | 0.060 | rejected |
| music-rhythm | 0.741 | **kept, hallucination shown** |
| music-full | 0.602 | **kept, hallucination shown** |

A beat modulates the envelope in exactly the band speech does. Two of four music
hallucinations would reach the screen. **Fails the pass criterion.**

## Candidate 2: the extension's own voice activity detector — passed

`desktop-app/scripts/probe-production-vad.mjs` replays audio through the
extension's actual stages, imported from `streaming.mjs`: `SpeechGain`, Silero V5
with 64 samples of context, and `SpeechWindows` with the production thresholds.
It reports how many recognition jobs the browser would send to the companion and
how many seconds were voiced at the 0.30 onset probability.

Calibration, before the evaluation set was touched: full spoken sentences 2.94 to
4.48 voiced seconds; digital silence 0 s and 0 jobs; the sine chord 0 s and
0 jobs. The frozen rule keeps an outro only when at least 1.0 s was voiced.

| Evaluation | Jobs sent to companion | Voiced seconds | Max probability | Rule |
| --- | ---: | ---: | ---: | --- |
| thanks-normal | 4 | 1.98 | 1.000 | kept |
| thanks-slow | 5 | 2.40 | 1.000 | kept |
| thanks-fast | 4 | 1.54 | 1.000 | kept |
| thanks-quiet | 4 | 1.98 | 1.000 | kept |
| thanks-over-music | 4 | 2.02 | 1.000 | kept |
| watch-thanks-short | 5 | 2.27 | 1.000 | kept |
| music-chords | 0 | 0.03 | 0.403 | rejected |
| music-rhythm | 0 | 0.00 | 0.037 | rejected |
| music-melody | 0 | 0.13 | 0.720 | rejected |
| music-full | 0 | 0.03 | 0.316 | rejected |

Six of six kept, four of four rejected. **Passes the pass criterion.** The closest
case is the melody, at 0.13 voiced seconds against a 1.0 s threshold.

## What the second candidate revealed about the current block

On the browser path, **none** of the music-only clips, including both from Stage 2,
would have been sent to the companion at all. The Stage 2 hallucination was found
by a harness that bypasses the VAD. So on that path the exact block currently
removes genuine thank-you captions to prevent a hallucination the extension
already filters out upstream.

It still earns its place on any path without that VAD, and against non-speech
audio that does trip Silero, which this set did not contain.

## Recommendation and implementation status

The browser-evidence approach below is implemented and verified in
`RETEST-OUTRO-EVIDENCE.md`. The desktop-only alternative remains unimplemented.

Keep an outro-artifact transcript when the audio shows speech; reject it
otherwise. Two ways to supply the evidence:

1. **Inside `MlxWhisperEngine`**, when a transcript is an outro artifact, run
   `SpeechGain` plus Silero V5 over that chunk and keep it at 1.0 s voiced or more.
   It covers every capture path and needs no protocol change. The model already
   ships with the desktop app: the `silero_vad_v5.onnx` in `@ricky0123/vad-web` is
   byte-identical to the extension's copy used here, SHA-256
   `2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f`. The cost is
   loading `onnxruntime-node` in the main process, which is not done today: its
   native binaries would need unpacking from the archive and a portability check
   in `verify-mac-package.cjs`.
2. **From the browser**, forward the job's existing `voicedSeconds` through
   `desktop-worker.js` and `background.js` with each decode. No new inference, but
   it covers only the browser path and needs the value threaded to the engine.

Either must be measured the same way before replacing the block, and the pass
criterion should be rerun on real livestream audio, including background music
with vocals, before it ships.

## Reproduction

```
python3 desktop-app/scripts/generate-continuity-corpus.py --output desktop-app/.test-out/outro-context --manifest tests/corpus/outro-context.json
~/Library/Application\ Support/JapaneseLiveCaption/venv/bin/python3 desktop-app/scripts/probe-outro-features.py <wav files>
node desktop-app/scripts/probe-production-vad.mjs <wav files>
```

The generator gained a `musicPattern` field for the four music clips. Raw rows:
`tests/results/outro-envelope-eval.jsonl`, `tests/results/outro-vad-eval.jsonl`.

## Remaining limitations

- Every clip is synthetic; real music with vocals is the obvious unmeasured case,
  and a sung lyric is speech-like to both candidates.
- Ten evaluation clips from one voice.
- The VAD result depends on the extension's gain stage and thresholds; a change
  to either invalidates it.
- Nothing was run in the browser or on the installed app.
