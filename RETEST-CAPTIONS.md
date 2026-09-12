# Stage 5 evidence: caption behavior and controls

Every behavior in the stage description was traced to the code that implements
it and pinned by a headless test where one was missing. The gate itself is
**not met**: it requires verification through the installed Opera extension on
YouTube, a livestream, Shorts and picture-in-picture, which this session cannot
drive.

No behavior was changed. This stage is an audit plus new regression coverage.

## Coverage of each required behavior

| Required behavior | Where it lives | Evidence |
| --- | --- | --- |
| Two selectable modes | `popup.html` offers `record` (four captions) and `realtime` (single); `background.js` maps the preference at capture start | code, and `background.test.mjs` / `recording-background.test.mjs` already exercise `captionMode` |
| Four entries, oldest at top | `caption-window.js` renders `rows.slice(-4)` in order | **new** `tests/caption-queue.test.mjs` |
| A fifth entry drops the oldest and the rest move up | same slice | **new** test asserts the visible pairs become 2,3,4,5 |
| Japanese first, Chinese below | each pair appends `jtl-spoken` then `jtl-chinese` | **new** test asserts pair order per row |
| Shared font size, colors, outline, background, opacity | `apply()` sets CSS custom properties on the panel root, so both modes inherit them | **new** test asserts every token, including `rgba(0,0,0,0.4)` from a 40% background |
| Adjustable background opacity | `backgroundOpacity` 0-100 in `popup.html`, clamped in `apply()` | same test |
| Transparent black background | default `#000000` at 60% | same test |
| Wrapping only when space runs out | `white-space:normal` with `overflow-wrap:anywhere` | **new** stylesheet assertion |
| Half-line spacing between caption groups | `.jtl-pair+.jtl-pair{margin-top:.675em}` against `line-height:1.35`, which is exactly half a line | **new** stylesheet assertion |
| Stopping audio closes the overlay | an empty render sets `visibility:hidden`; `content.js` renders null when polling reports not running | **new** test for the panel; the polling side is existing behavior |
| Movable and resizable, position persists | `begin()` / `place()` save a proportional rect to `chrome.storage.local` | existing `caption-window.test.mjs` |
| YouTube-like expiry | `captionHold` clamped to 1-6 s, `expiresAt` refreshed per update | existing `caption-expiry.test.mjs` |
| No separate always-visible overlay toggle | `popup.html` contains no overlay or always-on control; the only display control is the mode select | grep over `popup.html` |

New file: `tests/caption-queue.test.mjs`, four tests. Extension suite is now 75
tests. Nothing in the caption path was modified.

## Why the fixture could not be used visually

`tests/window.html` is the project's own four-caption drag and resize fixture. It
renders as a static snapshot in this session's preview pane, so its scripts do
not run and no caption is produced. The headless DOM harness that
`caption-window.test.mjs` already established was used instead, which exercises
the same `caption-window.js` code paths.

## What the gate still needs

These cannot be reached from here and are the ones to run in Opera:

- Each behavior above on a normal YouTube watch page, a livestream, and Shorts.
- Picture-in-picture and fullscreen, where a page content-script overlay cannot
  be hosted normally; the README already records the picture-in-picture limit.
- Dragging the overlay **beyond the video element** without losing the controls
  or the saved position. The unit test only proves the proportional rect is
  saved and restored inside a stubbed parent.
- That starting audio reveals the overlay in a real page, not only that the
  panel unhides when rows arrive.
- Rollover appearance with real wrapped multi-line captions, where the half-line
  spacing and the four-entry height interact with a real font.

## What is not established

- No installed run, no real video, no real capture.
- The tests assert structure and style tokens, not rendered pixels. A CSS rule
  can be present and still be overridden by a page's own styles, which is
  exactly what an installed check would catch.
- Expiry timing under sustained speech is covered only by the existing
  single-purpose expiry test.
