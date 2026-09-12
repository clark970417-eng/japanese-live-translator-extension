# Stage 13: production-model fidelity comparison and Opera verification

The installed application and extension remain at 3.8.4. This stage adds an actual-worker evaluation harness and completes the previously blocked Opera smoke test. No candidate model or prompt replaces the current default: the experiments found material semantic regressions. This is not a completed latency/quality overhaul or proof of superiority over upstream LiveTranslate.

## Evaluation design

The harness instantiates the application's Hunyuan translator classes and shared worker instead of reconstructing an approximate translation prompt in an independent inference script. Models use their pinned, SHA-verified Q4_K_M files and the normal quantized KV setting. The MT2 1.8B model was downloaded into the isolated benchmark profile; installed preferences were not changed.

Each run warms the model once and translates the same external manifest. There are 43 development sentences and a separately frozen 24-case holdout. Two alternative Chinese-to-Japanese prompt formulations were rejected on development examples; all holdout runs use the original 3.8.4 production prompt. No phrase replacement or prompt was tuned using the holdout. Quality observations below are developer assessments, not blinded ratings by independent bilingual reviewers.

The three model runs were sequential while the user continued normal computer use. These timings exclude audio, VAD, transcription, browser rendering and cold initialization. They are descriptive measurements, not controlled speedup estimates. In particular, the small MT2 model's development speed advantage did not persist in the holdout run.

| Model with original production prompt | Development median / P95 | Holdout median / P95 |
| --- | ---: | ---: |
| HY-MT1.5 1.8B | 384 / 609 ms | 356 / 521 ms |
| Hy-MT2 1.8B | 228 / 335 ms | 389 / 637 ms |
| Hy-MT2 7B | 1123 / 1971 ms | 1090 / 2049 ms |

P95 uses nearest rank. All nine runs completed: 330 sentence trials, no empty output or request error. Successful completion is not a correctness score. [Machine-readable timing summary](tests/results/stage13-summary.json) links the raw filenames.

## Semantic findings and decisions

| Case | Observation | Decision |
| --- | --- | --- |
| Sleep-related permission, holdout | MT2 1.8B translates being sleepy as being unable to sleep | Reject automatic small-model replacement |
| Rain conditional, holdout | MT2 1.8B changes “if rain does not stop, stay home” into “if it does not rain, stay home” | Reject automatic small-model replacement |
| Wednesday/Thursday correction, holdout | HY1.5 substitutes Tuesday for Wednesday; MT2 7B preserves the correction | Current model also has material factual errors |
| Personal sleep plan, development | HY1.5 produces an invitation; MT2 7B preserves the speaker's plan | 7B helps this case, not proof of universal quality |
| Going out soon, development | MT2 7B produces malformed negation while the current small model is clearer | Keep 7B optional, not mandatory for all speech |
| Completed archive viewing, holdout | MT2 7B uses 見てしまいました, introducing an unintended completion/regret nuance | Respectful style and tense still need work |
| More explicit polite prompt, development | Does not reliably fix wishes/plans; adds wrong schedule meaning | Reverted |
| Publisher-style short prompt, development | A sleep wish still becomes an accomplished event; thanks for effort becomes “it was difficult” | Reverted |

The publisher-style experiment was inspired by the [official MT2 prompt guidance](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF). Publisher claims were not used as measured evidence. Full outputs are retained under `tests/results/stage13-*`. The default production worker source is unchanged from 3.8.4.

## Installed Opera verification

A dedicated Opera GX window was used; the user's work windows were left open. The extension manager was reloaded from 3.8.3 to 3.8.4, and the popup confirmed 3.8.4. A Japanese YouTube video without native captions produced successive Japanese/Traditional-Chinese pairs and four-pair turnover. Stop returned to Ready. The initial smoke window was then closed.

A second dedicated window tested the installed extension again while six draft/translation requests ran in another tab. All six returned and the original video continued producing new captions. Two general local Chinese-to-Japanese drafts took 589 and 653 ms; the 21 ms curated phrase and 1 ms short translation must not be presented as general model inference performance.

The later rolling popup snapshot showed 2,343 audio blocks, processing P50/P95 787/1258 ms, queue P50/P95 31/707 ms, zero queued segments, no dropped audio and no audio resynchronization. The latest reported audio-end-to-Chinese value was 1628 ms; it is not a session median. The desktop-mode “translation 0 ms” field is not evidence of instantaneous translation. [Observed results](tests/results/stage13-browser.json).

Visible semantic problems remained: いけんじゃない? became 不是吧？ in a likely positive context, ヒル became 山獵, and a draft's possible inability became definite inability. Caption continuity passed this smoke test; translation correctness did not.

A further stop/start cycle produced new caption pairs and returned to Ready again. Its latest reported Chinese lag reached 2331 ms; processing P50/P95 was 995/1361 ms and queue P50/P95 was 0/534 ms. Both test tabs were closed afterward. These additional observations do not turn the short smoke test into long-duration or independent accuracy verification.

TypeScript verification and all 539 desktop tests passed. Production source and installed settings remain unchanged.

## Reproduction

Build the original production worker from revision `ab127c1`, then bundle `desktop-app/scripts/benchmark-fidelity.ts` next to it in `out/main`. Run Electron with `COMPARE_PROFILE` pointing to an isolated model profile, `FIDELITY_CASES` pointing to either manifest, and a fresh `COMPARE_REPORT` output path. `COMPARE_TRANSLATOR` is `7b`, `mt2-small`, or omitted for HY1.5. The three original-prompt and holdout reports use that production source. Alternative-prompt reports are rejected experiments, not the current harness default.

## Remaining acceptance work

Independent bilingual quality assessment, diverse sustained audio with manually aligned speech, controlled high-load end-to-end comparison against upstream, and the complete feature matrix remain open. The 24-case holdout has now been observed and must not become a hidden tuning set claimed as fresh evaluation. Future tuning requires a separately frozen evaluation set.
