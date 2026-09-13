# Companion death and reconnection: fault injection

Task: deterministic fault-injection coverage for companion death and
reconnection, verifying reinitialization, continued captions, clean Stop, and
rejection of stale pre-crash results.

**Result:** seven scenarios are now covered on both sides of the native
connection. Two of them failed on the unchanged code, and both defects are fixed.

## Where a death is seen

- **The desktop companion process dies.** The extension sees its native port
  disconnect. Recovery belongs to `native-client.mjs`, `desktop-worker.js` and
  the one-retry restart in `offscreen.js`.
- **The browser side dies while the companion lives**, for example an extension
  reload or a native host crash. The companion sees its socket close, must tear
  the old session down, and must accept the reconnecting client.

## Baseline

Every scenario was written as a test and run against the unchanged code first.

| Scenario | Side | Unchanged code |
| --- | --- | --- |
| Death rejects in-flight work; the next request opens a fresh host | extension | pass |
| Captions continue on the new host; Stop leaves nothing pending | extension | pass |
| A message the dead host delivers after reconnection is not accepted | extension | **fail** |
| A desktop worker terminated for restart ignores its late reply | extension | pass |
| A second, concurrent client is still refused | companion | pass |
| A client reconnecting while the old connection drains is accepted | companion | **fail** |
| The old connection's late results never reach the new client; captions and Stop work | companion | **fail**, blocked by the previous row |

### Defect 1: a replaced native port could still deliver

`NativeClient` checked port identity in its disconnect handler but not in its
message handler. A message queued on the old port before the host died could
arrive after the new port existed, and it was accepted: a pre-crash caption was
passed to the extension, and a message carrying a pending request's id would
have settled that request with the dead host's answer.

### Defect 2: a reconnect during teardown was refused

The companion refused any connection while `owned` was true, and cleared `owned`
only after the old connection's queue drained, the pipeline stopped and the
translator was released. With recognition in flight when the browser side died,
the reconnect arrived during that teardown and was closed immediately.

That matters more than it looks: `offscreen.js` allows one restart per session.
A refused reconnect spends it, and the next failure ends the caption session with
「請重新開始」.

A second timing issue surfaced while fixing it: a reconnect can reach the server
before the old socket's close has even been processed, so clearing `owned` on
close alone still refused it.

## Change

- `native-client.mjs`: messages from a port that is no longer current are ignored
  before any event is surfaced or any request settled.
- `extension-companion.ts`:
  - `owned` is cleared as soon as the socket closes, and the teardown is kept as
    a promise.
  - A new connection's operations await the previous connection's teardown, so
    the new session never touches a pipeline the old one is still stopping.
  - While a connection is open, a new client waits up to
    `OWNER_RELEASE_GRACE_MS` (2 s). If the owner closes in that time the new
    client is adopted; otherwise it is refused as a genuine second client.
  - The connection handler became a named `serve` function so a waiting client
    can be adopted later; its body is otherwise unchanged.

## Tests

- `tests/companion-fault.test.mjs`, four extension-side tests using a native
  runtime whose host can be killed between messages.
- `src/main/companion-reconnect.test.ts`, three companion-side tests with a
  recognition call that is still running when the browser side disconnects.

| Suite | Before | After |
| --- | ---: | ---: |
| Extension | 79 | 83 |
| Desktop | 588 | 591 |

All seven scenarios pass; every earlier test still passes; `tsc --build` clean.

## Measured result

| Scenario | Unchanged | Changed |
| --- | --- | --- |
| Stale caption from the dead host | delivered | ignored |
| Old host settling a new request | would settle it | ignored |
| Reconnect during teardown | closed immediately | accepted; work starts after teardown |
| Old connection's results on the new client | not reachable, client refused | none delivered |
| Captions after reconnect | not reachable | delivered for the new segment only |
| Stop after reconnect | not reachable | answered, no later events |
| Concurrent second client | refused at once | refused after 2 s |

Real-process restarts were already measured in the 60-minute rerun in
`RETEST-SOAK.md`, where both deliberate host restarts recovered; that run was not
repeated here, as instructed.

## Regressions and trade-offs

- **A genuine second client learns it is refused two seconds later** instead of
  immediately. No existing test depended on immediate refusal.
- A reconnecting client's first request now waits for the previous session's
  teardown, which includes any recognition that was in flight. That wait replaces
  a refusal that ended the session.

## Remaining limitations

- The `offscreen.js` restart path itself runs against AudioContext, VAD and
  worker APIs and is not exercised end to end; `desktop-worker.js` and
  `native-client.mjs` are, and the restart path is read, not run.
- Stale results are rejected by transport identity and by per-connection state.
  A caption produced by a restarted companion for a new segment is, correctly,
  accepted; nothing here validates a restarted companion's content.
- The one-retry limit in `offscreen.js` is unchanged. Two deaths in one session
  still end it.
