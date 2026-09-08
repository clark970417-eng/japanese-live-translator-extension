# Translation tuning — 3.3.1

## Implementation

- Exact whole-message phrase memory, never substring rewriting of negation or questions.
- Bounded LRU cache and shared in-flight requests for page text. No successful style cache entry on provider failure.
- Captions keep the fast translation route. With a saved NVIDIA key, a backup starts after one second or primary failure; the first valid result wins and the other request is cancelled. This may use additional provider quota on slow requests. Without a key only the free route runs.
- Title and manual post translation can use contextual prompts. The optional writing assistant uses a polite, conversational register and preserves negation, speaker perspective, and complete clauses. NVIDIA or OpenRouter access uses credentials supplied by the user. The extension does not promise free quota or endpoint availability.
- Missing/unavailable style providers produce a visibly labelled general translation fallback. Common reviewed phrases remain available without credentials. API fields are collapsed and never prefilled with saved secrets.
- Streaming-context correction for the observed アーカイブ → 檔案館 mistranslation. This is a narrow repair, not a universal glossary or full semantic validator.
- Composer results are discarded if the user changes the source while waiting. Drafts are never sent automatically.

## References and limits

- [live-translate](https://github.com/rioX432/live-translate): project documentation describes repeated-phrase LRU translation caching. We adapted the approach, not its implementation or performance claims.
- [Immersive Translate prompt guide](https://immersivetranslate.cn/docs/prompts/): context-aware prompts and translation-only output. This extension cannot see a live stream's future dialogue and does not pretend to have full-document context.
- [NVIDIA Riva language support](https://docs.api.nvidia.com/nim/reference/nvidia-riva-translate-4b-instruct-v2), [Qwen model](https://build.nvidia.com/qwen/qwen3.5-397b-a17b/modelcard), [OpenRouter model](https://openrouter.ai/google/gemma-4-31b-it%3Afree/providers).
- A public YouTube chat archive was examined for domain vocabulary such as リアタイ and アーカイブ. Test prompts were authored independently; no messages were copied or used as training data.
- Public X replies were examined to compare conversational registers. This was qualitative prompt research rather than a representative linguistic dataset.
- [NicoNico comment usage research](https://www.interaction-ipsj.org/archives/paper2013/data/Interaction2013/interactive/data/pdf/2EXB-39.pdf): applause-style comments. NicoNico encyclopedia pages could not be opened in this run. NicoNico-specific slang is not injected into ordinary polite messages; the extension's supported sites remain YouTube and X.

## Observed verification

28 automated tests cover cancellation, cache coalescing/eviction/retry, language-format rejection, exact phrase boundaries, and explicit fallback mode. These do not score general translation accuracy.

Opera displayed Reloaded / version 3.3.1 during the first browser test. Reviewed phrases returned in 2 and 8 ms. Two free JA→ZH requests returned in 2710 and 2627 ms. The latter exposed 檔案館 for livestream archive; the contextual repair was added afterward. The style provider was unavailable in that browser test, so general AI style quality has NOT been validated. Later edits require another reload; file copy alone is not proof of browser execution. This release is a prerelease.
