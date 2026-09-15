# v3.4.5 verification: display normalization and sensitivity

The presentation layer condenses extended exclamations and three-or-more consecutive repetitions while preserving the stored transcript and translation input. Ordinary sentences and deliberate two-word emphasis remain unchanged.

Voice detection thresholds were lowered and onset detection was shortened from 96 ms to 64 ms. Silence rejection remains active. Forty-two automated tests passed; this was not a long-duration livestream acceptance test.
