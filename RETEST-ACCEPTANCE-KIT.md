# Opera acceptance kit

Task: prepare a single Opera acceptance checklist and diagnostics collector for
the remaining Stage 1, 2, 5, 6, 7 and 9 gates, without claiming any of them.

**Result:** `OPERA-ACCEPTANCE.md` and a read-only collector exist. **No gate was
run and none has passed.**

## Baseline

The Opera-only gates were spread across `RETEST-CONTENTION.md`,
`RETEST-CONTINUITY.md`, `RETEST-CAPTIONS.md`, `RETEST-SURFACES.md`,
`RETEST-SOAK.md` and `CLAUDE-HANDOFF.md`, each listing what still needed a browser.
Nothing gathered machine-side evidence during a manual run, and nothing stated
which build a run would actually exercise.

## Change

- `OPERA-ACCEPTANCE.md`: 19 items in one place, each with steps, a pass condition
  taken from the handoff's gate wording, and a Pass, Fail or Not run box. Every
  box is unchecked. It opens by making the tester record the build under test.
- `desktop-app/scripts/collect-acceptance-diagnostics.mjs`, with `start` and
  `finish`: versions and file identity of the installed copies against source,
  swap-outs and free memory, involved processes, names of new crash reports, new
  desktop sessions that never logged their end, native host log errors since
  start, and gate-relevant numbers from pasted popup health dumps. It only reads.
  Output goes to a git-ignored directory because the native host log can contain
  captions.
- `desktop-app/scripts/acceptance-diagnostics-lib.mjs`: the collector's pure
  helpers.

## Tests

`tests/acceptance-diagnostics.test.mjs`, six tests: runtime comparison names only
missing and differing files; the runtime list covers the files the extension
loads; a session log without its end line is detected; memory counters parse;
crash reports are filtered by process name; health dumps map to the gate numbers.
Extension suite 89 passed.

## Measured result

A dry run of the collector against this machine:

| Collector finding | Value |
| --- | --- |
| Installed extension version | 3.8.6 |
| Installed app version | 3.8.6 |
| Source versions | 3.8.6 and 3.8.6 |
| Installed extension files differing from source | `native-client.mjs` |
| Swap-outs during the dry run | 0 |
| Output ignored by git | yes |

A separate read-only check of the installed app's archive: `out/main/index.js`
differs from a build of `a98ff7a`, and `out/main/slm-worker.js` is identical.

So the installed build predates the request-subject repair, the cold-draft
interrupt, repeated-caption suppression and the reconnect fixes, while carrying
the same version as source. The checklist makes the tester choose between testing
that build as it is and repackaging under a new version with permission.

## Regressions

None. No production or extension runtime file changed in this task.

## Remaining limitations

- Health dumps are copied by hand from the popup's DevTools console; the
  installed extension was not modified to export them.
- The collector cannot see inside Opera: stuck listening, overlay layout and
  composer behavior are judged by the tester.
- `desktop-app/scripts/verify-mac-package.cjs` pointed at the installed app was
  terminated by the system with exit code 137 and no output. The narrower archive
  hash comparison above was used instead, and the checklist's S9.1 still names the
  full verifier.
- Pushing `main` and choosing a new version are owner decisions, outside the kit.
