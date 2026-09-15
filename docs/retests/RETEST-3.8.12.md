# 3.8.12: live Japanese preview latency hotfix

## Reported symptom

During an actual Japanese livestream, the speaker could reach a third sentence
before the first Japanese caption appeared and translation began.

## Root cause and fix

Extension 3.8.11 limited desktop rolling recognition previews to one every five
seconds. It also discarded every new rolling preview while the recognizer or
its queue was busy. That protection prevented unbounded work, but created a
large visible delay during continuous speech.

Version 3.8.12 removes that outer throttle. The existing bounded decode queue
now does the intended scheduling: completed utterances remain lossless, while
waiting rolling previews are replaced by only the newest revision. As soon as
the current recognition finishes, that latest preview starts without waiting
for another VAD event. This keeps current Japanese visible without building an
unbounded preview backlog.

Worker recovery now uses the same queue policy. An interrupted final stays at
the front in its original order. An interrupted rolling preview is retried only
when it is still useful; an accepted final or newer preview supersedes it.

## Verification

- A controller-level regression test reproduces speech changing while desktop
  recognition is busy and verifies that the newest preview starts immediately
  after the busy result.
- Recovery regressions verify that accepted finals and the newest preview run
  ahead of an obsolete interrupted preview, while a still-useful interrupted
  preview remains retryable.
- Extension suite: 107/107 tests passed.
- Desktop suite: 642/642 tests passed.
- Desktop TypeScript check passed.
- `git diff --check` passed.

This hotfix changes only the Opera extension scheduling layer and remains
compatible with the installed 3.8.11 desktop app. A real livestream smoke test
after reloading the unpacked 3.8.12 extension is still required to measure the
end-to-end result on the user's current stream and hardware.
