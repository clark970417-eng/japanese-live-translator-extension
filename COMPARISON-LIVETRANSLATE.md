# LiveTranslate comparison

## Scope

The unmodified upstream source at `rioX432/live-translate`, commit
`3d333e6296240d17dfc72207eac7fd7a7499a663`, was built in an isolated checkout.
Its interface was opened with a separate application profile. No upstream GitHub
Release was listed at the time of inspection; this is a source-build comparison,
not evidence about a separately distributed commercial product.

Both pipelines were exercised with the same MLX Whisper Large v3 Turbo model,
HY-MT1.5 1.8B Q4_K_M translation weights, 16 kHz mono WAV, and growing audio windows
at 1.2, 2.8, 4.5, 6.5, 8.5 seconds, followed by finalization. Tests covered Japanese
to English and Chinese. Engines were warmed before measurements; repeated rounds
retained pipeline context. This harness bypasses capture, VAD, rendering, and
browser messaging, so it is not an end-to-end UI comparison.

## Observed differences

| Area | Upstream observation | Fork observation / action |
| --- | --- | --- |
| Startup dependencies | MLX audio decoding failed until FFmpeg was placed on the test PATH | Direct WAV decoding avoids that dependency for captured PCM |
| Interface | Audio source, level, interval, and expandable advanced controls were visible; Apple M5 was detected | Original desktop interface retained; extension has a compact control surface and settings entry |
| Interim source | Older translation responses could restore an older source hypothesis | Keep the latest source while attaching compatible translation results |
| Silence | A one-second silent PCM input produced “Thank you.” / “谢谢。” | Same silent input returned no caption |
| Speculative translation | Worker repeatedly logged “No sequences left” and fell back | Check capacity before speculation; do not force a previous incorrect response prefix |
| Stop lifecycle | Original subprocess cleanup logged a null-process error | Fork already captures the child process before asynchronous disposal; additional stale-work guards added |
| Chinese suitability | Simplified Chinese output, with context sometimes repeated ahead of the current source | Traditional Chinese output and source-only context; awkward wording still occurs |

## Timing conclusion

No defensible overall speed winner is established. Both applications ran while the
Mac was locked; several rounds were interrupted by system sleep. Those timings are
invalid for ranking. Even the uninterrupted-looking short runs are insufficient to
establish performance under normal active use. The final coalescing optimization
requires a fresh awake A/B run.

The earlier Opera test of the fork produced first Japanese at 1.70 seconds and
first Chinese at 3.03 seconds, but it must not be compared directly with this
pipeline-only harness. See `RETEST-3.7.0.md` for the boundary of that result.

## Reproduction

`scripts/benchmark-pipeline.ts` in `desktop-app` runs the actual pipeline and engine
classes. Compile it into `out/main/benchmark-pipeline.cjs` after the normal app build
so worker and bridge paths resolve correctly. Run it with Electron and set:

- `COMPARE_PROFILE`: a separate test profile with the local GGUF model installed.
- `COMPARE_AUDIO`: a mono 16-bit PCM WAV at 16 kHz.
- `COMPARE_REPORT`: an output JSON path.
- `COMPARE_TARGET`: optional `en` or `zh`; default tests both.
- `COMPARE_ROUNDS`: optional repeat count; default two.

Keep the machine awake, run each implementation separately, retain raw events,
and exclude runs containing sleep. The harness does not request cloud inference.
Use diverse held-out speech, silence, music, and overlapping voices before making
quality or long-session claims. The current fixture alone is not representative.
