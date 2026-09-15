# Version 3.6.0 verification

Tested on September 11, 2026, on the development Mac with Opera GX.

## Integration

The complete MIT-licensed rioX432/live-translate source is included under
`desktop-app`, pinned to `3d333e6296240d17dfc72207eac7fd7a7499a663`.
The extension sends captured audio to its production translation pipeline through
native messaging and a private Unix socket. Models run locally. This adapter
uses finalized audio chunks; it is not an incremental ASR decoder.

## Checks completed

- 486 desktop tests, 45 extension tests, and 5 Python tests passed.
- Desktop type checking, build, and local unsigned application packaging passed.
- Two direct integration sessions processed four spoken chunks and two digital
  silence chunks. Source events preceded translations. Silent chunks returned
  empty results. Spoken processing took 1.45–1.55 seconds after chunk receipt;
  this excludes the time spent collecting speech.
- Opera GX visibly loaded extension version 3.6.0.
- The extension's capture test played a known 10.72-second Japanese fixture
  through the production capture and translation path. All five updates appeared.
  The first Japanese text appeared at 3.70 seconds after playback started and its
  Chinese translation at 3.85 seconds. Later Chinese updates appeared at 6.40,
  7.90, 9.70, and 11.95 seconds. The test stopped capture normally.
- Browser diagnostics reported median decode time of 1,221 ms and median
  first-Japanese latency of 3,260 ms. These are fixture results, not guarantees.

## Remaining limits

The fixture is short and synthetic; it does not establish long-session stability
or accuracy for overlapping speakers, background music, or quiet speech.
Digital-silence rejection does not eliminate all ASR hallucinations.
Translations can still be awkward or add context; the observed output translated
an unfinished greeting as “今天是…”. Traditional-Chinese normalization addresses
script consistency, not semantic accuracy. Japanese reply style remains model
 dependent. No model training or zero-latency claim is made.

The installed app is a local unsigned build. Models are downloaded separately and
are not committed to Git. Existing single-pair/four-group captions and styling
remain in the extension; this short capture test does not exercise every UI mode.
