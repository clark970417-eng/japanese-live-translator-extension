# Desktop 3.7.3 and extension 3.7.4 verification

September 11, 2026. Staged changes and earlier baseline results are documented in
[OPTIMIZATION-PROGRESS.md](OPTIMIZATION-PROGRESS.md).

## Controlled upstream comparison

Original LiveTranslate commit `3d333e6296240d17dfc72207eac7fd7a7499a663`
was compared with this fork using the same 10.7223-second synthetic Japanese audio,
MLX Whisper large-v3-turbo, HY-MT1.5 1.8B Q4, shared installed models, warmed engines,
Japanese source selection and Chinese target selection. Runs were sequential.
The upstream engine internally keeps automatic language detection despite that
source selection; this fork propagates Japanese to the recognizer. The harness
bypasses browser capture/VAD and feeds progressively longer audio windows.

The final comparison was repeated after reconnecting AC power and completing the
browser capture test, with no concurrent benchmark workload:

| Metric, seconds | Original round 1 / 2 | Fork round 1 / 2 |
| --- | --- | --- |
| First nonempty Chinese after audio starts | 3.703 / 4.326 | 2.303 / 1.935 |
| Final Chinese after audio ends | 1.836 / 2.358 | 1.921 / 2.544 |

First partial Chinese was earlier; complete final Chinese was slightly slower.
This is two rounds of one fixture, not evidence of overall product superiority.
Original output was simplified Chinese; fork output was traditional Chinese.
Both had wording/meaning issues. Original added a welcome-to-event clause; the
fork expanded thanks-for-coming into thanks-for-participating and extra thanks.
Upstream emitted a thank-you caption for silent PCM; the fork returned no text.

[Original raw results](tests/results/stage5-upstream-ac.json) ·
[Fork raw results](tests/results/stage5-fork-ac.json)

Earlier runs are retained rather than discarded: [original](tests/results/stage5-upstream.json),
[fork](tests/results/stage5-fork.json), [repeat](tests/results/stage5-fork-repeat.json).
One fork run included approximately 448 seconds of system sleep, confirmed by
macOS power logs ending at 17:39:20, and cannot represent normal inference latency.
The subsequent repeat also ran much slower; its cause was not isolated. These
observations do not establish a load-independent latency guarantee.

## Installed Opera capture

The 3.7.3 production capture page completed six continuous audio segments (79.33
seconds), retained four caption groups, and stopped capture. Japanese appeared at
1.55 seconds, first partial Chinese at 2.57 seconds, and a full greeting at 2.87
seconds. Six first-Japanese measurements had median 1,578 ms and p95 1,771 ms;
64 decoder measurements had median 729 ms and p95 1,157 ms. Queue wait was zero
in the reported sample. This was a known synthetic fixture, not an arbitrary live
YouTube broadcast. Provisional text included incorrect wording before correction.

The installed text-only draft test passed in 2,709 ms without enabling voice
capture. The desktop app's installed archive matched the built 3.7.3 archive.

## Comment composer correction (extension 3.7.4)

The previous YouTube composer selector covered live chat only. Comment and Shorts
editors now each receive a Chinese-to-Japanese control, including dynamically
created reply editors. Results cannot overwrite edited or removed source text.
X controls now mount before the reply toolbar, outside the clipped rich-text
region. Drafts remain editable and are never submitted automatically.

## Validation and remaining scope

56 extension tests and 496 desktop tests pass. Desktop TypeScript and production
build checks pass. Five Python bridge tests were previously verified; bridge code
is unchanged in this release. The 31.8-minute, 140-round engine run is documented
separately and bypassed browser capture. Cold-start comparisons, hours-long live
streams, all optional engines, and universally polite/accurate Japanese remain
unverified. No model fine-tuning was performed.

## Viewer tone reference and rejected candidates

The user requested warm, concise, respectful conversational Japanese rather than
mandatory formal endings on every sentence. The cloud-provider style prompt now
reflects that preference; cloud output was not retested without an API. Nine
reviewed whole-message phrases cover common compliments, goodnight/recording
encouragement, rest, schedules and offering help. Exact matching never replaces
a fragment of a longer message. Existing emoji and laughter are preserved in
these entries. The local general-purpose prompt remains the previously validated
version: two alternative prompts regressed tense and one exposed instruction
text in the output, so neither was shipped. This is not Gemini-level general
translation or model fine-tuning.

The UI now uses compact white/black CH/JP and JP/CH buttons. Installed composer
fixtures verified separate YouTube and Shorts editors and translation insertion.
These fixtures model website markup; they do not establish compatibility with
every future YouTube/X layout. No comments were posted.
