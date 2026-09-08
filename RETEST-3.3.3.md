# v3.3.3 verification: independent controls and translation fallback

Opera GX loaded the unpacked v3.3.3 build on September 8, 2026. The test used the production background worker and locally stored provider settings. No message was submitted.

This version separated page-text translation from audio caption capture. Disabling page translation removes generated title, chat, comment, and X translations; re-enabling it performs a new scan. The audio start/stop control remains independent.

The NVIDIA route was updated to `nvidia/nemotron-3.5-lightning-30b-a3b` with reasoning output disabled. Translation prompts preserve complete clauses, intent, and a polite register. Provider failure is identified as a general machine-translation fallback rather than presented as a styled result.

Browser checks translated a Japanese title and chat message, removed both when disabled, and restored one copy of each without duplication. Automated tests covered stale asynchronous responses, provider parameters, and truncated output. Speech recognition was unchanged in this version.
