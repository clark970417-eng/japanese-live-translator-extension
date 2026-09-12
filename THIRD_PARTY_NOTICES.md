# Third-party runtime and design references

The existing bundled Transformers.js / ONNX Runtime code is preserved in whisper-runtime.js. ONNX Runtime Web is Copyright Microsoft Corporation, licensed under MIT. Transformers.js is licensed under Apache-2.0. Embedded notices remain in the bundle.

Design references (no third-party source copied for the new orchestration):
- https://github.com/ufal/whisper_streaming — LocalAgreement inspired the consecutive hypothesis prefix comparison. This implementation compares Japanese characters, not word timestamps, and is not the upstream algorithm verbatim.
- https://github.com/Superactive-AI/inbrowser-ai — dedicated inference worker and speech segmentation.

Silero V5 model is distributed from the pinned npm package `@ricky0123/vad-web@0.0.29`, under `vendor/silero/`. See its bundled LICENSE for Silero MIT and ricky0123 ISC notices. SHA-256: `2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f`. The recurrent ONNX input/output contract follows https://github.com/ricky0123/vad/blob/master/packages/web/src/models/v5.ts . The model is loaded locally; no microphone or cloud audio upload is used.

Commercial product pages informed interaction design only. Their private implementation and advertised latency were not independently verified.

## Optional model evaluation and downloads (3.8)

Hy-MT2 7B is downloaded separately from
[Tencent's model repository](https://huggingface.co/tencent/Hy-MT2-7B-GGUF), pinned
to revision `ab8472660ac61fac25f1af43fac2599d52a8a775`. Model weights are not included
in this Git repository or the application archive; consult the model repository
for its applicable license and usage terms.

The recognition evaluation also used
[mlx-qwen3-asr](https://github.com/moona3k/mlx-qwen3-asr) 0.4.0 and
[Qwen3-ASR-0.6B](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) in an isolated local
Python environment. These are evaluation dependencies, not a bundled or enabled
production recognition path. See the 3.8 test report for the rejected results.
