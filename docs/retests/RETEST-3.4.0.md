# v3.4.0 verification: ordered transcript mode

This version added an ordered four-entry transcript mode while retaining the single-pair low-latency mode. Final recognition is stored before translation, allowing capture to continue while network requests are pending. Failed translations remain available for retry and export.

The caption panel uses equal Japanese and Chinese type sizes, configurable colors and opacity, a continuous translucent background, and saved drag/resize geometry. The most recent four utterances are displayed in processing order.

Thirty-nine automated tests covered persistence, queue order, recovery, bounded audio storage, caption rotation, and panel geometry. This version did not claim zero latency, unlimited recording, or perfect recognition.
