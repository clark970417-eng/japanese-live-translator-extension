# Current Work Handoff for Claude

Read this document before planning or changing code. It defines the current task scope for this fork and takes precedence over upstream-oriented product statements in `desktop-app/CLAUDE.md` when they conflict with this work.

## Project identity

The repository being developed is:

`/Users/clark/Documents/ChatGPT/日文/japanese-live-translator-extension`

The separate directory below is an unmodified reference checkout only:

`/Users/clark/Documents/ChatGPT/日文/live-translate-upstream`

Do not implement changes in the upstream checkout, treat it as the user's application, merge it wholesale, or infer that every upstream feature is part of the current task. Use it only for source comparison and matched benchmarks.

The installed artifacts are separate copies:

- Opera unpacked extension: `/Users/clark/Downloads/youtube-translator-extension`
- Desktop companion: `/Users/clark/Applications/Japanese Live Translate.app`

Source changes belong in this repository first. Installed copies are updated only after the relevant tests and build pass.

## Directory map: what is what

The parent directory `/Users/clark/Documents/ChatGPT/日文` contains two unrelated products and one reference checkout. Do not choose a project by filename similarity.

| Path or item shown in Finder | What it is | Role in this task |
| --- | --- | --- |
| `japanese-live-translator-extension/` | The Japanese live translation extension and desktop companion fork | **This is the only working source repository for the current task.** Make source, test, report, and version changes here. |
| `live-translate-upstream/` | A clean checkout of the original LiveTranslate project | Read-only reference for source inspection and matched benchmarks. Never implement or commit the user's changes here. |
| `app.js`, `index.html`, `styles.css`, `sw.js` | Source for a separate JLPT N5 learning PWA named `nihongo-line-n5` | Unrelated. Do not edit for translation-extension work. |
| `cloud-config.js`, `firebase.json`, `firestore.rules`, `.firebase/`, `.firebaserc` | Firebase configuration and deployment files for that JLPT N5 PWA | Unrelated. Do not edit or deploy for this task. |
| `supabase/` | Supabase material belonging to the parent learning-app workspace | Unrelated. Do not edit for this task. |
| `manifest.webmanifest`, `icon.svg` | Install metadata and icon for the JLPT N5 PWA | Unrelated. These are not the Opera extension manifest or icon. |
| parent `package.json`, `package-lock.json`, `node_modules/` | Firebase tooling dependencies for `nihongo-line-n5` | Unrelated. Do not install, remove, or update these for this task. The live translator has its own dependencies under `japanese-live-translator-extension/desktop-app/`. |
| parent `README.md` | Documentation for the JLPT N5 learning PWA | Unrelated. Do not use it as the translator specification. |

Within the working repository, `manifest.json`, `background.js`, `offscreen.js`, `content.js`, `x-content.js`, the caption-window files, and their tests are the Opera extension. `desktop-app/` is the desktop companion source. The many `RETEST-*.md` files are historical evidence, not separate applications. `CLAUDE-HANDOFF.md` is the current scope and continuation guide.

## Current objective

The active work is a focused local HY-MT translation and latency investigation for the Opera extension plus desktop companion. The current target is:

1. Japanese livestream audio to immediate Japanese text and Traditional Chinese subtitles.
2. Traditional Chinese typed comments to natural, cute but respectful Japanese drafts.
3. Preserve the fork's extension-specific subtitle UI, website text translation, four-caption queue, movable/resizable overlay, comment-draft controls, and local desktop control path.
4. Reduce latency and mistranslation with measured evidence under the local HY-MT path.

This task is **not** an audit or repair of every engine and every upstream feature.

## Translation configuration under test

The current default local translator is HY-MT1.5 1.8B Q4_K_M (`offline-hymt15`). Hy-MT2 7B is an optional quality mode (`offline-hymt2`). Hy-MT2 1.8B has been benchmarked as a candidate but was rejected as an automatic replacement because it introduced serious semantic regressions despite some faster text-only runs.

Unless the user explicitly broadens the task, do not evaluate, reroute, repair, or make product decisions around:

- Google, DeepL, Microsoft, Gemini, OpenRouter, NVIDIA, or other cloud APIs
- Gemini Live or other cloud realtime speech paths
- OPUS-MT, Apple Translate, TranslateGemma, PLaMo, LFM2, or unrelated model families
- automatic API rotation, quotas, billing, or provider fallbacks

Those implementations may remain in the repository for compatibility. Their presence does not make them part of the current work.

## Exact production path in scope

For Opera audio captions:

`Opera tab audio -> extension offscreen/VAD -> native messaging -> extension-companion.ts decode -> TranslationPipeline -> MLX Whisper -> HY-MT local translator -> caption event -> extension overlay`

For typed Chinese comments:

`YouTube/Shorts/X composer -> background.js makeDraft -> native messaging translate -> extension-companion.ts -> HY-MT local translator -> draft-fidelity.ts -> composer draft UI`

The native companion intentionally exposes only `settings`, `stop`, `init`, `decode`, and `translate`. Do not interpret the lack of unrelated upstream operations as a bug during this task.

Primary files for the current work:

- `desktop-app/src/main/extension-companion.ts`: bridge, scheduling, audio/control/text operations
- `desktop-app/src/main/companion-scheduler.ts`: priority and serialization before model work
- `desktop-app/src/main/worker-pool.ts`: shared HY-MT worker lifecycle, cancellation, model affinity
- `desktop-app/src/main/slm-worker.ts`: actual local model prompt and generation
- `desktop-app/src/main/draft-fidelity.ts`: bounded written-comment repair only
- `desktop-app/src/pipeline/TranslationPipeline.ts` and `StreamingProcessor.ts`: live speech pipeline
- `background.js`, `offscreen.js`, `stream-core.mjs`: extension capture, queueing, diagnostics, and presentation flow

## Current verified state

Current product commit at the time of this handoff: `d57fdc3` (`3.8.5`). Commit `014f9fd` added the first version of this handoff without changing product code. Both were published to `origin/main`; confirm the current head before beginning work.

Version 3.8.4 rebuilt cancellation and queue recovery. Its cooperative-cancellation development benchmark reduced the median cancelled-generation plus following translation from 679 ms to 424 ms while retaining the context. It also passed a 46-segment repeated-audio run without empty final captions.

Version 3.8.5 added a narrow repair for written Chinese comments when a positive uncertainty marker such as `可能`, `也許`, or `或許` disappears from the Japanese result. The installed Opera extension produced the repaired result after the old desktop process was explicitly restarted:

- Source: `明天可能沒辦法來看，但我會看直播存檔，不要勉強自己喔`
- Before: `明日はできませんが、配信の保存映像を観るつもりです。無理にはしないでくださいね。`
- After: `明日は見ることができないかもしれません。でも、配信の記録を見るつもりです。無理に自分を追い込まないでくださいね。`

This is a narrow correction, not general semantic validation. `配信の記録` is still less natural than `アーカイブ`. The guard intentionally excludes `不一定`, conditions, quotes, long text, and `不可能` because broader heuristics produced false positives or regressions.

Latest verification before this handoff:

- Desktop: 550 tests across 53 files passed
- Extension: 70 tests passed
- TypeScript and production build passed
- Installed desktop 3.8.5 passed archive/runtime-byte, renderer-assets, signature, and native-addon portability checks
- All 26 installed extension files matched 3.8.5
- Opera manager and popup showed 3.8.5
- Stop returned the live caption session to Ready with zero pending segments

Read `RETEST-3.8.4.md`, `RETEST-3.8.5.md`, `RETEST-STAGE13.md`, `ACCEPTANCE.md`, and `COMPARISON-LIVETRANSLATE.md` before claiming a result. Raw measurements are under `tests/results/`.

## Immediate problem to solve next

The next task is the shared-worker latency spike, not feature expansion.

During an installed Opera test, a repaired written draft ran while live Japanese captions were active. The written draft completed in about 2.97 seconds and captions continued, but the rolling diagnostics later showed:

- processing P50/P95: 868/1868 ms
- queue P50/P95: 109/926 ms
- pending segments: 2 during Stop/drain
- latest observed audio-end-to-Chinese value: 8412 ms
- dropped audio: 0
- audio resynchronizations: 0

The 8.4-second value is a failed latency target. The evidence suggests that audio and written translation ultimately contend for one HY-MT inference worker. `CompanionScheduler` gives audio preference before an operation starts, but it cannot preempt a multi-call written repair already using the shared worker.

Investigate and measure this exact contention before editing. Candidate directions include cancellation/preemption of low-priority written repair when audio arrives, postponing optional repair while capture is active, or a carefully bounded separate worker if memory measurements prove it safe on this 16 GB Mac. Do not choose a direction without measuring queue age, memory, cancellation recovery, and translation output.

Success for the next change requires all of the following:

1. The same local HY-MT model and hardware conditions are used before and after.
2. Live captions remain prioritized when a written draft is requested concurrently.
3. Accepted final speech is not dropped, reordered, duplicated, or restored after Stop.
4. Stop drains or cancels bounded work and returns to Ready.
5. The uncertainty-preserving written-draft behavior is retained, or the original completed draft returns with a clear review warning.
6. Before/after median, P95, maximum, queue age, memory, and error counts are reported with measurement boundaries.
7. Tests, production build, installed bundle verification, and an independent Opera window smoke test pass before GitHub publication.

## Sequential continuation plan

Work through these stages in order. Finish, measure, and document one stage before starting the next. A passing unit suite alone does not complete a stage that requires an installed Opera check. Keep the production path on local HY-MT throughout these stages; do not widen the work to every API or model.

### Stage 1 — Eliminate live-caption starvation

Reproduce the shared-worker contention described above, then change scheduling or cancellation so a typed comment cannot block live audio for several seconds. Compare the same audio, model, thermal state, and concurrent draft workload before and after. Record first Japanese text, first Chinese text, final Chinese text, queue age, P50/P95/max, memory, cancellations, dropped segments, and recovery after Stop.

Completion gate: the 8.4-second class of contention spike is no longer reproduced across repeated trials, live captions keep priority, the draft either completes or reports a reviewable interruption, and no caption is blank, duplicated, reordered, or restored after Stop.

### Stage 2 — Improve streaming recognition continuity

Test real speech rather than only repeated fixtures: quiet speech, fast speech, background music, pauses, startled exclamations such as `あー！`, and repeated speech such as `やば...`. Tune VAD, partial/final boundaries, deduplication, and silence handling only from measured failures. Japanese source text must appear as soon as recognition produces a useful partial; it must not wait for Chinese translation.

Completion gate: speech does not remain stuck at “listening,” short utterances are detected reliably, silence does not create stock hallucinations such as closing/thanks phrases, and repetition or exclamation is represented without flooding duplicate captions.

### Stage 3 — Improve Japanese-to-Traditional-Chinese accuracy

Create a fresh, frozen evaluation set before changing prompts or repair rules. Include negation, tense, uncertainty, casual contractions, incomplete speech, game terms, names, pronoun omission, emotional reactions, and multi-sentence context. Separate recognition errors from translation errors. Prefer model/prompt/context improvements over sentence-specific substitutions.

Completion gate: bilingual review shows a measurable improvement on the unseen set with no material regression in negation, speaker intent, or invented content. Report failures that remain; do not call the stage complete from test count alone.

### Stage 4 — Improve written Traditional-Chinese-to-Japanese drafts

Validate ordinary YouTube comments, Shorts comments, replies, livestream chat drafts, and X replies. The target voice is cute, warm, and respectful without becoming childish or overly intimate. Preserve negation, possibility, tense, names, emojis, line breaks, and the user's actual intent. Replace unnatural wording such as `配信の記録` with contextual Japanese such as `アーカイブ` through general terminology/context handling, not a whole-sentence hard-code.

Completion gate: a fresh review set passes both semantic fidelity and tone review, including the known possibility/negation case. The extension inserts a draft for review and never submits it automatically.

### Stage 5 — Verify caption behavior and controls

Retain both user-selectable modes: the original single-caption realtime mode and the four-caption queued mode. In four-caption mode, entries read from oldest at the top to newest at the bottom; a fifth entry removes the oldest and the remaining entries move upward. Show Japanese first, then attach Chinese below it. Both modes share font size, colors, outline, transparent black background, and movable/resizable positioning. Keep natural wrapping only when space runs out, half-line spacing between caption groups, adjustable background opacity, and YouTube-like expiry. Starting audio shows/enables the caption overlay; stopping audio closes it. Do not reintroduce a separate always-visible overlay toggle.

Completion gate: verify each behavior through the installed Opera extension on normal YouTube, livestream, Shorts, and picture-in-picture/fullscreen where applicable. Confirm the overlay can be moved beyond the video element without losing controls or position persistence.

### Stage 6 — Verify website translation and composer coverage

Check Japanese titles, livestream chat, comments, and visible page text to Traditional Chinese, plus Chinese-to-Japanese drafting in YouTube comments, Shorts comments, livestream chat, and X reply composers. Use resilient selectors and mutation handling so dynamic panels and virtualized comment lists continue working after navigation.

Completion gate: every supported surface works after in-page navigation and panel reopen, with no duplicate buttons, missing drafts, accidental post, or translation loop.

### Stage 7 — Long-session and recovery validation

Run short cold-start tests and at least one 60-minute mixed workload with unseen speech, pauses, music, rapid utterances, typed drafts, Stop/Start cycles, tab navigation, extension reload, and desktop companion restart. Measure memory growth, queue backlog, latency distribution, missing captions, duplicates, stale captions, model reloads, and process recovery. Keep the user's other Opera windows untouched.

Completion gate: no stuck-listening state, blank final caption, unbounded queue/memory growth, lost accepted sentence, or unrecoverable native connection appears. Averages must not hide P95/max latency spikes.

### Stage 8 — Matched LiveTranslate comparison

Compare this fork with the pinned `live-translate-upstream` revision using the same Mac, source clips, model, warm/cold conditions, output-language task, and measurement boundaries. Compare feature behavior separately from latency, recognition, translation quality, memory, and recovery. Do not use the fork's cached phrases against uncached upstream runs.

Completion gate: update `COMPARISON-LIVETRANSLATE.md` with reproducible commands, raw result locations, failures, and an honest category-by-category verdict. Claim superiority only for categories supported by matched evidence; never convert a partial win into a universal claim.

### Stage 9 — Package, install, and publish

After the active stage passes, run the full desktop and extension suites, TypeScript checks, production build, archive/runtime-byte checks, renderer-asset checks, signature/native-addon checks, and installed-file comparison. Replace the desktop app only after terminating the old process. Copy the exact tested extension files to `/Users/clark/Downloads/youtube-translator-extension`, reload that unpacked extension in a dedicated Opera test window, and repeat the relevant smoke test.

Completion gate: source, packaged app, installed app, and installed extension all identify the same version and bytes; `git diff --check` and `git status` are clean after an English commit; `main` is pushed to GitHub. Do not create a GitHub Release.

## Known unfinished work and how to classify it

| Item | Current status | Priority and owner guidance |
| --- | --- | --- |
| Shared HY-MT worker can block live captions during written-draft repair | Reproduced with an 8.4-second latest end-to-Chinese value | Highest priority; Stage 1. |
| Occasional stuck “listening” or missing new utterance | Previously reported by the user; short smoke tests have passed but broad reproduction is incomplete | Stage 2, then long-session confirmation in Stage 7. |
| General Japanese-to-Chinese mistranslation | Some semantic failures remain; no broad independent proof of superiority | Stage 3. Do not patch benchmark sentences individually. |
| Cute/respectful Chinese-to-Japanese style and fidelity | Narrow uncertainty repair works, but `配信の記録` remains unnatural and broad validation is incomplete | Stage 4. |
| One-line/four-line overlay behavior and controls | Implemented across several releases, but every surface and long-session interaction has not been re-accepted under the current build | Stage 5. Preserve existing features while fixing defects. |
| YouTube/Shorts/X dynamic composer coverage | Implemented, with earlier reports of missing controls on comments/replies | Stage 6; test drafts only. |
| High-load and long-duration stability | Prior long runs exist, but contention and tail latency remain unresolved | Stage 7 after the earlier pipeline changes. |
| “Fully better than LiveTranslate” | Not established | Stage 8 must produce matched evidence; treat this as an evaluation target, not a preset conclusion. |

If Claude finds a new defect, first place it into one of these stages, capture a reproducible case and baseline, and then decide whether it blocks the active stage. Do not abandon the active latency/accuracy work to fix an unrelated feature merely because it is easy to notice.

## Explicit non-goals for the current task

Do not start work on these merely because they exist in upstream or appear incomplete:

- speaker labels or confidence indicators
- TTS, voice output, or virtual microphone support
- accessibility setting parity with the desktop overlay
- arbitrary audio-file format support through FFmpeg
- cloud realtime translation
- adding more translation providers or UI engine choices
- release publishing, auto-update channels, Windows parity, or Linux support
- broad desktop UI redesign
- fixing every upstream feature gap

Only touch one of these if the user explicitly changes the scope.

## Rules for safe continuation

- Keep documentation, code comments, commits, and PR text in English.
- Preserve the user's extension features even if upstream lacks them.
- Do not hard-code whole benchmark sentences as translation replacements.
- Do not tune on a frozen holdout and then describe it as unseen evidence. Create a new frozen set before observing candidate output.
- Separate recognition quality, translation quality, and end-to-end latency in reports.
- Cached phrases and warmed repeated audio are regression controls, not general latency evidence.
- Never claim that the project fully surpasses LiveTranslate without a matched, broad, independently reviewable comparison.
- Keep rejected experiments and failures in the report when they affected the decision.
- Use a dedicated Opera test window. Do not close or repurpose the user's other Opera windows.
- Before testing an installed desktop change, verify that the old desktop process actually exited; copying a new `.app` bundle does not replace a running process.
- Do not post comments, replies, or messages during composer tests. Generate drafts only.
- Do not edit `live-translate-upstream`; compare against its pinned revision.
- Do not create GitHub Releases. Commit and push `main` only after the requested work and verification are complete.

## Recommended first actions for Claude

1. Run `git status` and confirm the current commit before changing files.
2. Read the five reports named above and the primary files listed in this handoff.
3. Reproduce worker contention with a deterministic local harness before changing scheduling.
4. Add a failing regression test for the chosen contention/cancellation behavior.
5. Make the smallest change that lowers live-caption queue delay while preserving written-draft behavior.
6. Run the complete desktop and extension suites, then build and verify the packaged app.
7. Test through the installed extension in a separate Opera window and report failures honestly.

If a request appears to concern all product features, confirm whether the user has explicitly changed this HY-MT-only scope before modifying unrelated subsystems.
