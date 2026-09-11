# Version 3.7.2 verification

Date: September 11, 2026. Apple M5, 16 GB unified memory, macOS, Opera GX.

## Changes

- Translate the first recognition hypothesis immediately instead of adding a
  one-second debounce. Coalesce later revisions for 250 ms and keep only the
  latest pending interim request while translation is busy.
- Preserve glossary hints but exclude previous complete utterances from partial
  translation prompts. This prevents a repeated opening phrase from pulling the
  previous sentence's ending into the new caption before it is spoken.
- Emit silent frames when the tab has no input channels, allowing VAD to finish
  an utterance across media pauses instead of merging successive playback runs.
- Use one subprocess stdin error listener instead of adding one per request.
  Resolve pending requests when the subprocess exits and permit reinitialization.
- Fix a streaming-lock waiter that compared the wrong callback identity and could
  fail to time out. A timed-out finalization cannot enter STT concurrently.
- Hold an Electron application activity assertion during active pipeline work,
  releasing it on idle/disposal. This allows display sleep and does not establish
  that application suspension caused the observed long-test slowdown.
- Bound the browser fixture's playback wait, detect missing captions, and restore
  the user's subtitle settings after testing.

## Before/after short measurements

Actual MLX Whisper and HY-MT1.5 engines, same 10.7223-second Japanese fixture,
separate sequential runs, warmed engines. Times are seconds after audio starts.

| First Chinese caption | Before | After |
| --- | --- | --- |
| Round 1 | 3.398 | 2.195 |
| Round 2 | 4.254 | 2.151 |
| Round 3 | 4.456 | 2.410 |

The first Chinese in both versions translated the same greeting. Repeated rounds
can benefit from cache; the first round also improved. Final translation averaged
12.02 seconds before and 12.00 seconds after: final-sentence latency is essentially
unchanged. These measurements preceded the application activity assertion.

[Before events](tests/results/latency-371-baseline.json),
[after events](tests/results/latency-372-fast.json).

## Sustained engine exercise

40 rounds completed in 1,144.669 seconds (19.1 minutes), with a silence probe and
stop/reinitialization every five rounds. Every round produced a nonempty Japanese
source and Chinese final translation. No pipeline error or fatal event occurred;
all silence probes were empty. The stdin listener warning found during an earlier
aborted attempt did not recur after the fix.

First Chinese ranged from 2.848 to 7.036 seconds (median 5.258). Final output had
a median elapsed time of 25.121 seconds. This was a sequential stress harness:
it deliberately processed every growing audio window even when inference fell
behind. It bypasses browser capture, VAD and the browser's coalescing/backpressure,
so these final timings must not be presented as measured browser caption latency.
The computer remained in ordinary use and other build/UI work ran during this test;
these are stability observations rather than an isolated speed benchmark.

Main-process RSS ranged from 37.0 to 60.2 MiB; JavaScript heap from 4.13 to 5.39 MiB.
Those figures exclude Python/Metal allocations and do not prove an absence of all
memory leaks. The existing quantized-context initialization fallback was exercised;
it recovered without a fatal event. This run preceded the final activity assertion.

[Raw sustained events](tests/results/latency-372-soak.json).

## Checks and browser acceptance

- 495 desktop tests across 44 files, TypeScript checks and production build pass.
- 48 extension tests pass. Five Python tests pass in the installed Python environment.
- Opera extension manager and popup visibly reported version 3.7.2 after reload.
- Browser caption-window fixture retained rows 2–5 after inserting row 5, in order.
- Website fixture translated the title/chat to Traditional Chinese, cleared them
  when disabled, and restored one instance each without changing voice state.
- Desktop settings saved and retained MLX + HY-MT1.5, Japanese to Chinese after reopening.
- Five additional rounds with the activity assertion all produced final captions.
  First Chinese was 4.47–5.16 seconds under the then-current workload; this does
  not establish a speed improvement from the assertion.
  [Activity assertion run](tests/results/latency-372-guard.json).
- The installed Opera capture test completed six consecutive fixture segments in
  one 79.33-second audio stream with 2.5-second gaps. It retained four caption
  groups and registered six first-Japanese events. Storage diagnostics confirmed
  six distinct group identifiers in capture order. First partial Japanese appeared
  at 1.67 seconds, first partial Chinese at 1.82 seconds; the full greeting arrived
  at 2.87 and 3.47 seconds respectively. These are warmed, synthetic-fixture
  measurements, not guarantees for arbitrary speech.
- An earlier replay-based check falsely expected four groups while seeking back
  to the start between clips. Production correctly starts a new caption session
  on seeks. The fixture now concatenates clips before capture to exercise
  continuous speech without resetting the session.

- Single-pair installed capture produced 10 caption updates, then cleared itself.
  The observed hide time was 58 ms after the scheduled expiry (150 ms polling).
  First source appeared at 1.86 seconds and first Chinese at 2.30 seconds.

## Translation spot check

Twelve uncached text-only cases used the installed local HY-MT1.5 model, bypassing
extension phrase overrides. All returned output in 250–819 ms after initialization.
Negation, two attempts, tomorrow at 8 pm, and left versus right were preserved in
these cases. Japanese drafts generally used polite endings. Two important quality
limitations remain: the thanks-for-coming sentence was awkward in Chinese, and
one Chinese future inability-to-stay sentence became past tense in Japanese.
This small manual spot check is not an accuracy benchmark and does not establish
natural conversational quality for all inputs. [Raw outputs](tests/results/translation-372-quality.json).

## Scope

The source tree and existing custom features remain integrated. These tests do not
certify universal feature parity, every optional engine, hours-long sessions, or
superior accuracy to upstream. The repeated synthetic fixture is not a diverse
speech corpus. Final Chinese still expands some wording; translation quality is
not considered solved. No zero-latency or bug-free claim is made.
