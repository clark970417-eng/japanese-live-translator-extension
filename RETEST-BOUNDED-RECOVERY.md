# Bounded repeated companion recovery

This change lets a live browser caption session recover from two separated
desktop companion or speech-worker failures without creating an unlimited
restart loop.

## Baseline

The offscreen controller allowed one restart for the lifetime of a capture
session. A second companion death stopped capture immediately with a generic
request to restart. Work arriving while a desktop worker was unavailable was
also discarded outside recording mode.

## Change

- Permit two automatic recovery attempts per capture session.
- Apply bounded backoff: 250 ms before the first replacement and 500 ms before
  the second.
- Keep desktop audio jobs in the bounded decode queue while a replacement is
  starting, including the interrupted job when it is still safe to retry.
- Ignore errors and results from every replaced worker by worker identity.
- After the budget is exhausted, stop capture and show a terminal Chinese error
  that tells the user to press Stop and Start again.
- A manual Start creates a new capture session and a fresh retry budget.
- Clear a scheduled replacement during Stop so no worker can launch afterward.

## Deterministic fault injection

The test starts a desktop capture, interrupts two different workers with audio
in flight, advances each backoff, and verifies that the accepted jobs reach the
replacement exactly once. A late result from the first dead worker is ignored.
A third failure produces the terminal error and launches no fourth automatic
worker. Manual Start then proves that one new recovery is permitted, and Stop
leaves the controller clean.

The existing single-failure, stale-port, queued-audio and Stop/drain tests were
retained. Their immediate-restart assumption was updated to advance the new
250 ms backoff.

## Verification

- Focused recovery and fault-injection tests: 10 passed.
- Full extension suite: 94 tests passed.
- `git diff --check`: passed before commit.

## Remaining limitations

- The two-death test uses deterministic browser and worker doubles. Installed
  Opera still needs a real-process two-death acceptance run.
- Audio older than the existing freshness bounds may still be discarded; the
  change preserves accepted work only while it remains safe to publish.
- Permanently broken installation or model files terminate after two retries;
  they are not repaired automatically.

