# Opera acceptance checklist

**Status: not run. No gate in this checklist has passed.** It collects every
remaining Opera-only gate from Stages 1, 2, 5, 6, 7 and 9 of `CLAUDE-HANDOFF.md`
in one place. A gate passes only when a person runs it in Opera and records the
result below. Diagnostics support a result; they are not one.

## 1. Decide which build is under test

The installed copies are **not** the current source, and both are labelled 3.8.6.

| Copy | What it contains | Evidence |
| --- | --- | --- |
| `~/Applications/Japanese Live Translate.app` | packaged at `1a21741` | `out/main/index.js` inside its archive differs from a build of `a98ff7a`; `slm-worker.js` is identical |
| `~/Downloads/youtube-translator-extension` | synced at the 3.8.6 install | differs from source only in `native-client.mjs` |

Changes in source but **not** installed: the request-subject repair
(`docs/retests/RETEST-DIRECTIVE.md`), interrupting a cold large-model draft
(`docs/retests/RETEST-COLD-DRAFT.md`), repeated-caption suppression
(`docs/retests/RETEST-CAPTION-REPEATS.md`), and the reconnect and stale-port fixes
(`docs/retests/RETEST-FAULT-INJECTION.md`).

Choose one and write it here before starting:

- [ ] **A. Test the installed build as it is.** Results apply to `1a21741`. Items
  marked *HEAD only* are skipped, and Stage 9 cannot pass.
- [ ] **B. Repackage current source first.** This replaces the installed app and
  extension, which needs the owner's explicit permission. Give it a new version
  such as 3.8.7 first: two different builds must never share one version, which
  is the Stage 9 identity rule.

Build under test: `________`  Tester: `________`  Date: `________`

## 2. Rules for the run

- Use a **dedicated Opera test window**. Do not close, reload or reuse any other
  Opera window.
- **Never post** a comment, reply or chat message. Generate drafts only, then
  clear the composer.
- Before testing a desktop change, confirm the old desktop process has exited;
  copying a new app does not replace a running one.
- Do not create a GitHub Release. Pushing `main` is a separate, permitted step
  after this checklist, not part of it.

## 3. Diagnostics

Start the collector before the first item and finish it after the last. It only
reads; it never touches Opera, the installed extension or the installed app.

```bash
cd desktop-app && node scripts/collect-acceptance-diagnostics.mjs start opera-run-1
```

At each point marked **health dump**, open the extension popup in the test
window, right-click it, choose Inspect, and run this in that console. It copies
what the popup's diagnostics panel shows, as JSON.

```js
copy(JSON.stringify(await chrome.runtime.sendMessage({ type: 'health' }), null, 2))
```

Paste each into a file, for example `health-s1-trial1.json`. Finish with every
dump attached:

```bash
cd desktop-app && node scripts/collect-acceptance-diagnostics.mjs finish opera-run-1 --health s1-t1=health-s1-trial1.json --health s7-end=health-s7-end.json
```

Output goes to `desktop-app/.test-out/opera-acceptance/opera-run-1/`, which git
ignores because the native host log can contain captions of what was watched.
Review it before sharing. It records versions and file identity, swap-outs and
free memory, new crash reports from the involved processes (names only),
desktop sessions that never logged their end, native host errors since start,
and the gate-relevant numbers from each health dump.

## 4. Checklist

Mark each item Pass, Fail or Not run, and write what was seen. A Fail with a
clear note is more useful than a guessed Pass.

### Stage 1: live captions keep priority over drafts

| ID | Steps | Pass when | Result |
| --- | --- | --- | --- |
| S1.1 | Desktop mode on a Japanese video or stream with continuous speech. While captions update, write `明天可能沒辦法來看，但我會看直播存檔，不要勉強自己喔` in the YouTube comment box and generate a draft. **Health dump** right after the draft appears. Repeat five times. | In all five: captions keep updating while the draft is produced; audio-end-to-Chinese stays below 8000 ms, the 8.4 s class; the draft appears or shows a review warning; no blank, duplicated or reordered caption. | ☐ Pass ☐ Fail ☐ Not run |
| S1.2 | After S1.1, press Stop. Wait 10 s. **Health dump**. | The overlay closes, nothing reappears, the popup shows ready, pending is 0. | ☐ Pass ☐ Fail ☐ Not run |
| S1.3 | *HEAD only.* Restart the desktop app. With no captions running, generate a draft, then start audio within one second. | First Chinese appears without waiting for the large draft model; the draft still appears afterwards. | ☐ Pass ☐ Fail ☐ Not run |

### Stage 2: recognition continuity on real speech

| ID | Steps | Pass when | Result |
| --- | --- | --- | --- |
| S2.1 | Find and play real speech covering: quiet speech, fast speech, speech over background music, pauses, a startled `あー！`, and repeated `やば…`. Note the video and timestamps. | Never stuck at "listening" for more than 10 s while someone speaks; short utterances appear; exclamation and repetition appear without flooding duplicate captions. | ☐ Pass ☐ Fail ☐ Not run |
| S2.2 | Play at least 60 s with music and no speech, such as a stream intro. **Health dump**. | No caption text appears; in particular no `ご視聴ありがとうございました` or closing-thanks line. | ☐ Pass ☐ Fail ☐ Not run |
| S2.3 | Play a streamer genuinely saying `ご視聴ありがとうございました` on its own. | Record what appears. The shipped exact block is expected to drop it; `docs/retests/RETEST-OUTRO-CONTEXT.md` explains why and what would fix it. This item documents, it does not gate. | Observed: ________ |

### Stage 5: caption behavior and controls

| ID | Steps | Pass when | Result |
| --- | --- | --- | --- |
| S5.1 | Realtime mode on a normal watch page. | One caption pair, Japanese above Chinese; it disappears a few seconds after speech stops, like YouTube captions. | ☐ Pass ☐ Fail ☐ Not run |
| S5.2 | Record mode, at least six utterances. | At most four entries, oldest at the top; a fifth removes the oldest and the rest move up; text wraps only when out of space; half a line between groups. | ☐ Pass ☐ Fail ☐ Not run |
| S5.3 | Change font size, both colors, outline, background color, background opacity and caption opacity. Reload the page. | Every change applies to both modes and survives the reload. | ☐ Pass ☐ Fail ☐ Not run |
| S5.4 | Start audio, then Stop. Look for any separate always-visible overlay switch. | Start shows the overlay, Stop closes it, and no such switch exists. | ☐ Pass ☐ Fail ☐ Not run |
| S5.5 | Drag the overlay partly outside the video element; resize it from an edge; reload. | Controls remain reachable; the position and size come back after reload. | ☐ Pass ☐ Fail ☐ Not run |
| S5.6 | Repeat S5.1 on a livestream, a Short, fullscreen, and picture-in-picture. | Captions work on the livestream, the Short and fullscreen. Picture-in-picture cannot host the page overlay, a known limit: record what happens. | ☐ Pass ☐ Fail ☐ Not run |

### Stage 6: page translation and composers

| ID | Steps | Pass when | Result |
| --- | --- | --- | --- |
| S6.1 | Website text on. Check a Japanese title, live chat, comments, and other visible text. Scroll the comments far enough that the list recycles. Navigate to another video in the page, then close and reopen the comments and chat panels. | Chinese appears for Japanese text on every surface after navigation and reopen, with no duplicate lines, no duplicate buttons, and no line that keeps re-translating. | ☐ Pass ☐ Fail ☐ Not run |
| S6.2 | Generate a Chinese-to-Japanese draft in a YouTube comment, a reply, a Shorts comment, live chat, and an X reply. Repeat after in-page navigation and after reopening each composer. | Each draft is inserted for review, none is posted, no composer shows two buttons, no request is left without a draft. | ☐ Pass ☐ Fail ☐ Not run |

### Stage 7: long session and recovery in the browser

| ID | Steps | Pass when | Result |
| --- | --- | --- | --- |
| S7.1 | One 60-minute session on real Japanese audio with pauses, music, rapid speech, typed drafts, at least three Stop and Start cycles, and tab navigation. **Health dump** every 15 minutes. | No stuck listening, no blank final caption, no lost accepted sentence, no growing backlog or memory, and p95 and maximum latency in the dumps reported, not only averages. | ☐ Pass ☐ Fail ☐ Not run |
| S7.2 | During captions, quit the desktop app and relaunch it. **Health dump** after captions resume. | Captions resume or the popup gives a clear error with a working retry; no caption from before the quit appears afterwards. *HEAD only* includes the reconnect fixes. | ☐ Pass ☐ Fail ☐ Not run |
| S7.3 | During captions, reload the extension from the extensions page, then start again. | The session recovers on start, with no stale caption. | ☐ Pass ☐ Fail ☐ Not run |

### Stage 9: installed build identity and smoke test

| ID | Steps | Pass when | Result |
| --- | --- | --- | --- |
| S9.1 | Read `buildUnderTest` in the collector summary. For the app, compare its archive with a build of the tested commit, as `desktop-app/scripts/verify-mac-package.cjs` does. | Installed extension identical to source, and installed app runtime identical to the tested commit, under one version. **Build A cannot pass this today.** | ☐ Pass ☐ Fail ☐ Not run |
| S9.2 | In the dedicated test window, reload the unpacked extension, open a Japanese video, start captions, confirm Japanese and Chinese, stop. | Works end to end, and the extension page and popup show the version under test. | ☐ Pass ☐ Fail ☐ Not run |

## 5. Results summary

| Stage | Items | Passed | Failed | Not run |
| --- | ---: | ---: | ---: | ---: |
| 1 | 3 | | | 3 |
| 2 | 2 gating, 1 recorded | | | 2 |
| 5 | 6 | | | 6 |
| 6 | 2 | | | 2 |
| 7 | 3 | | | 3 |
| 9 | 2 | | | 2 |

A stage's Opera gate passes only when every gating item in it passes on the build
recorded in section 1. Update the matching `RETEST-*.md` with the result and the
collector summary; do not mark a stage complete from this file alone.

## 6. What this checklist cannot decide

- Translation accuracy and draft tone, which Stages 3 and 4 judge on frozen sets.
- Whether a failure is the extension, the companion or the video; the collector
  narrows it, a person decides.
- Anything about a build other than the one recorded in section 1.
