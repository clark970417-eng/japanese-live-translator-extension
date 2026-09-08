# v3.4.2 verification: source-first display

Recognized Japanese is displayed as soon as it is available; the corresponding Traditional Chinese line is filled later. The panel shows the latest four entries and continues after a translation timeout by retaining a failed record.

Single-pair and ordered modes share the same movable, resizable visual system. The panel is constrained to the webpage viewport.

Forty automated tests passed, including queue rotation, translation timeout continuation, and viewport-bound dragging. This remains incremental windowed recognition rather than zero-delay streaming.
