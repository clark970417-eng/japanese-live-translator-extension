# Version 3.7 verification

Date: September 11, 2026. Platform: Apple M5, macOS, Opera GX.

## Completed checks

- 490 desktop tests across 42 files, TypeScript checks, and production build pass.
- 47 extension tests pass; five Python bridge tests passed earlier in this revision.
- The complete imported upstream tree remains attributed and MIT-licensed.
- Popup inspected in Opera: compact controls, disclosure sections, desktop-settings entry, version 3.7.0.
- Production Opera capture fixture completed with streaming Japanese and Chinese updates and a normal stop.

The browser run used a 10.7223-second synthetic Japanese recording. Japanese first
appeared at 1.70 seconds; Chinese first appeared at 3.03 seconds. Complete translation
arrived at 16.09 seconds. These are elapsed times from playback start, not per-word
latency. This run preceded the final coalescing and cancellation changes below;
its numbers must not be attributed to those changes.

## Final changes covered by regression tests

- Late translation no longer replaces the latest Japanese hypothesis with an older source.
- Pending recognition cannot restart translation after reset/stop.
- Interim translation requests are coalesced while another interim request runs.
- Model initialization failure releases browser ownership so the user can retry.
- External streamed revisions update the same transcript item; visible groups keep the latest four.
- Native asynchronous caption events remain deliverable after a request acknowledgement.

The local worker also avoids speculative decoding when no context sequence is
available. Where speculation is available, previous translation tokens are proposals,
not a forced response prefix. This removes a source of retaining an incorrect draft.

## Translation observations

A separate ten-sentence text check preserved tested negation, quantities, and time
information. Some wording remained awkward: a greeting was over-expanded, Chinese
phrasing was unnatural, and one Japanese reply retained an unnecessary second-person
pronoun. The audio fixture also briefly translated a request to wait as a request to
rest before final correction. Translation quality is not considered fully solved.

## Pending acceptance

The Mac became locked and repeatedly entered sleep during final comparison runs.
System power logs confirmed sleep intervals, including one lasting 978 seconds.
Suspend-affected timings were rejected. Latest packaged changes still require an
Opera reload and a fresh awake test, including six utterances for four-group rollover,
single-pair expiry, and the full desktop settings save flow. No zero-latency,
long-session stability, or universal feature-parity claim is made.


## Awake follow-up

The final 3.7.0 extension was reloaded in Opera and completed a new capture run:
first Japanese 1.77 seconds, first Chinese 2.97 seconds, final translation 13.92
seconds from playback start, followed by normal stop. The previous same-fixture
browser run finalized at 16.09 seconds; this single-run difference is encouraging
but is not a statistically established latency improvement.

A separate awake upstream/fork pipeline comparison is now recorded in
`COMPARISON-LIVETRANSLATE.md`. Its timing shows no clear overall speed winner.
Four-group rollover, single-pair expiry, and the desktop settings flow are being
checked separately from those engine measurements.
