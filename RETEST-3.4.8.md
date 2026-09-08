# v3.4.8 verification

- 44 automated tests passed, including retained audio retry after decoder timeout and following-job recovery.
- Opera GX popup and Extensions page confirmed v3.4.8 enabled.
- Real tabCapture test used tests/japanese-fixture.wav through the production VAD, Whisper, translation and caption renderer.
- Before shortening continuous chunks: first displayed Japanese 16.05 s, completed Japanese 20.08 s, Chinese 23.68 s from audio playback start.
- After 5-second chunks with 1.024-second overlap: first Japanese 6.02 s, next Japanese updates 9.77/9.92 s, Chinese 9.92/10.52 s, final update 12.62 s. Caption text was present in the rendered page accessibility tree.
- This is a single fixture comparison, not a universal latency guarantee. Model warmup and device load differ between runs.
- Recognition included an extra thank-you phrase; translation wording remains imperfect. Long livestream stability and native video picture-in-picture caption rendering are not certified by this test.

Changes: retry preserved audio once after decoder timeout, continue queuing during reload, derive caption visibility from current rows, stop old-context polling, shorten continuous recognition chunks while preserving utterance IDs. Existing queue rotation tests pass; four distinct live utterances were not separately measured in this run.
