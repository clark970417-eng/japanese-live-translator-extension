# Changelog

This file records user-facing changes. Public preview builds use `beta-vX.Y.Z` tags; stable builds use `vX.Y.Z` tags.

## 4.2.2 - 2026-09-22

### Quieter website translation

- Kept automatic translation on YouTube, Twitch, X, TikTok, Bilibili, Facebook, and Instagram.
- Changed all other websites to per-host opt-in from the extension popup.
- Prevented ChatGPT and similar general conversation pages from receiving automatic translation rows under user messages.
- Preserved tab-audio captions on general websites even when page-text translation is off.
- Added a regression test proving a general conversation hostname stays untouched until explicitly enabled.

## 4.2.1 - 2026-09-22

### Website coverage

- Enabled page translation on ordinary HTTP and HTTPS websites.
- Added dedicated Facebook and Instagram rules for titles, comments, chat, and writing editors.
- Preserved specialized YouTube, Twitch, X, TikTok, and Bilibili adapters.
- Added a conservative fallback for semantic titles, chats, comments, replies, and message editors on other websites.
- Added all-frame support so compatible embedded chat and comment surfaces can be translated.

### Safer writing translation

- Kept generated replies as reviewable drafts; the extension never presses a site's submit button.
- Limited the general writing control to fields identified as comments, messages, chat, replies, or posts.
- Excluded search, login, password, email, phone, and URL fields from the general adapter.

### Languages and captions

- Kept independent language choices for page reading, typed replies, and spoken captions.
- Kept the optional synchronized mode that reverses the reading pair for typed replies.
- Retained movable bilingual captions, display modes, transcript history, configurable colors, background, opacity, and fully removable text outline.

### Reliability and packaging

- Aligned the extension and desktop app at version 4.2.1.
- Verified 129 extension tests and 668 desktop tests.
- Passed desktop TypeScript checks, production build, macOS deep signature verification, and an Opera GX start/stop integration run.

### Known limits

- Text drawn into images, video, canvas, or inaccessible closed components is not available to page scripts.
- General website matching is intentionally conservative; unusual custom editors may need a dedicated adapter.
- Public beta packages are unsigned and can trigger operating-system warnings. Follow [BETA-TESTING.md](BETA-TESTING.md).

## 4.2.0 - 2026-09-22

- Added production-style beta packaging for macOS, Windows, Linux, and the Chromium extension.
- Added checksums, provenance metadata, update channels, rollback guidance, and public feedback templates.
- Expanded multilingual caption, translation-engine, TTS, virtual-microphone, and compatibility support.

## 4.1.1 - 2026-09-22

- Added an unsigned cross-platform preview and excluded the unsupported Windows audio backend from Windows packaging.
