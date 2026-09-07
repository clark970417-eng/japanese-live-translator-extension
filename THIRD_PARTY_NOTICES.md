# Third-party runtime and design references

The existing bundled Transformers.js / ONNX Runtime code is preserved in whisper-runtime.js. ONNX Runtime Web is Copyright Microsoft Corporation, licensed under MIT. Transformers.js is licensed under Apache-2.0. Embedded notices remain in the bundle.

Design references (no third-party source copied for the new orchestration):
- https://github.com/ufal/whisper_streaming — temporal transcript ownership and bounded processing; LocalAgreement is not yet implemented in this preview.
- https://github.com/Superactive-AI/inbrowser-ai — dedicated inference worker and speech segmentation. Silero VAD is not yet included; energy gating cannot reliably distinguish music from speech.

Commercial product pages informed interaction design only. Their private implementation and advertised latency were not independently verified.
