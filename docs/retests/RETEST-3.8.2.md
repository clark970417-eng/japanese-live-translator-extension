# 3.8.2: drain accepted audio when recording stops

This extension-only revision fixes a confirmed data-loss path. Desktop 3.8.1 remains compatible and unchanged. The broader latency and translation-quality overhaul remains in progress.

## Behavior

Previously, Stop immediately terminated the recognition and VAD workers and discarded queued audio. In recording mode, Stop now disconnects input immediately, flushes the audio worklet's partial buffer, completes the VAD tail without waiting for an artificial pause, and drains accepted final recognition jobs before terminating the workers. The background retains the original session during this drain so its final results remain valid. The desktop Stop request follows the browser audio drain.

The popup reports completion in progress and disables a new start until the drain finishes. A failed final-result delivery or flush timeout reports incomplete work rather than silently acknowledging success. Realtime mode retains immediate cancellation. Existing recording translation work can continue after input stops, as before.

## Verification

- 70 extension tests passed. New coverage exercises the actual offscreen controller with queued final jobs, a partial worklet buffer, delayed final delivery, delivery failure, and ordered termination. The background test verifies that final results remain accepted during drain and become stale afterward.
- The VAD worker test uses the real speech-window implementation with a deterministic VAD substitute: a voiced tail is finalized once, padded by less than one frame, and stale-session flush requests are ignored. This test is not a speech-accuracy measurement.
- Opera's extension manager and popup confirmed version 3.8.2 after reload. All 26 installed extension files matched the repository bytes.
- Two capture/Stop cycles were exercised in a separate Opera window using Japanese video without native captions. Both returned to ready; the second followed an observed recognition/translation-in-progress status. Seven new exported records contained Japanese and Chinese. The single failed-record indicator belonged to an older September 10 record, not these runs.
- An early first-run diagnostic snapshot reported processing P50/P95 671/960 ms, queue P50/P95 0/119 ms, latest audio-end-to-Chinese 604 ms, and no expired or resynchronized audio. These are a small operational snapshot, not a matched speed comparison or speech-onset latency measurement.

## Remaining limits

This revision does not improve model accuracy or establish lower latency than upstream. The actual export still contains awkward and potentially incorrect recognition/translation. The live smoke test cannot prove that every spoken word was captured; deterministic queue tests verify the drain invariant. Unexpected browser termination, storage failure, and repeated decoder failure still do not provide durable recovery of raw audio. Long sustained overload can make drain slow; no accepted-audio loss or universal stability claim is made for those cases.

Previous measurements and rejected local concurrency experiments remain in [3.8.1](RETEST-3.8.1.md). Those limitations are not superseded by this incremental fix.
