# Stage 6 evidence: website translation and composer coverage

The resilience mechanisms the stage asks for are already implemented. This
report traces each one and adds the regression coverage that was missing for
virtualized lists and in-flight results. The gate is **not met**: it requires
every surface to be exercised after in-page navigation and panel reopen in the
installed extension, which this session cannot drive.

No behavior was changed.

## Selector resilience

| Surface | Selector | Why it survives markup churn |
| --- | --- | --- |
| Video title | `ytd-watch-metadata h1 yt-formatted-string` | custom element plus semantic tag, no generated class |
| Comments | `ytd-comment-thread-renderer #content-text, ytd-comment-view-model #content-text` | two renderer generations are matched, so a rollout of either keeps working |
| Livestream chat | `#message.yt-live-chat-text-message-renderer, yt-live-chat-text-message-renderer #message` | matches the id-on-element and element-wraps-id shapes |
| Comment and chat composers | `#input[contenteditable='true'], #input.yt-live-chat-text-input-field-renderer, #contenteditable-root[contenteditable='true']` | three composer shapes: watch page, live chat, Shorts and replies |
| X posts and replies | `[data-testid="tweetText"]`, `[data-testid^="tweetTextarea_"]`, `[data-testid$="RichTextInputContainer"]`, `[data-testid="toolBar"]` | test ids with prefix and suffix matchers, which survive the numbered and namespaced variants X ships |

No selector depends on a hashed or generated class name.

## Mutation, navigation and duplicate prevention

- A `MutationObserver` on the document rescans, and `content.js` also listens
  for `yt-navigate-start` to reset state on in-page navigation.
- Composer controls are tracked in a `WeakMap` keyed by the editor element and
  reinstalled only when the previous control is no longer `isConnected`, so a
  repeated scan cannot add a second button. `x-content.js` uses the same
  pattern for composers and for posts.
- A translation line is looked up with `:scope > .jtl-translation` before one is
  created, so the existing line is updated rather than duplicated.
- Extra `.jtl-title` lines beyond the first are removed on every scan, and a
  title line whose content is no longer CJK is dropped.

## Loop and stale-result prevention

`translated` is a `WeakMap` from element to the source text that was sent. The
Chinese line is inserted as a **sibling**, so the source element's text never
changes and the guard `translated.get(element) === text` makes a repeated scan a
no-op. Before writing a result, `translateElement` requires all of: website text
still enabled, the toggle epoch unchanged, the element still connected, and the
element's text still equal to what was sent.

That last condition is what makes virtualized comment lists safe. YouTube
recycles a comment node for a different comment; the in-flight result for the
old text is then discarded instead of being written under the new one.

## New regression coverage

`tests/page-translation.test.mjs`, four tests against the real `content.js` with
a recyclable node:

| Test | What it pins |
| --- | --- |
| unchanged message | repeated mutation scans produce exactly one request and one line |
| recycled node | a result whose text is gone is discarded, and the node's new text is translated on the next scan |
| line reuse | a second translation updates the existing line instead of adding one |
| toggle during flight | turning website text off drops a result already in flight |

Extension suite is now 79 tests. Existing coverage for the composer side stays
as it was: independent controls per editor, discovery of dynamically replaced
editors, late drafts not overwriting edits, X replies not stealing another
editor's toolbar, and the no-submission guard added in Stage 4.

## Known limitation found while auditing

`hasJapanese` tests for kana only (`[぀-ヿ]`). A Japanese comment written
entirely in kanji, for example a short 「本日休止」 or a name, is therefore never
translated. This is deliberate: the same rule is what stops the extension from
translating Chinese comments and looping on its own output. Widening it needs a
language decision, not a selector fix, so it is recorded rather than changed.

## What the gate still needs

- Every surface after in-page navigation: watch page to Shorts to another video,
  and the comments panel and live chat panel closed and reopened.
- A real virtualized comment list scrolled far enough to recycle nodes.
- X reply composers opened from different entry points in one session.
- Confirmation of no duplicate buttons, no missing draft, no accidental post and
  no translation loop on those real surfaces.

## What is not established

- Headless DOM stubs, not a browser. A selector can be correct in the stub and
  still miss in the real page, which is exactly what the installed check covers.
- The stub asserts structure and request counts, not rendered position or the
  page's own styles overriding the inserted line.
- Shorts and X were audited by reading selectors; only YouTube comment and chat
  paths gained new tests.
