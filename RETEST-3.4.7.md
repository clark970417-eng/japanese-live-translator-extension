# v3.4.7 verification: Silero context

Each 512-sample Silero V5 input now includes the preceding 64 samples of context, which is cleared on reset. The implementation follows the upstream Silero VAD input contract.

Forty-three automated tests passed. A real browser VAD run on the 10.722-second Japanese fixture processed 126 blocks; 112 crossed the speech threshold and the maximum probability was 0.9999739. This validates voice detection on one controlled fixture, not complete translation accuracy or long-duration reliability.
