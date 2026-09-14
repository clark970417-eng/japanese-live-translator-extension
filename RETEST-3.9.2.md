# 3.9.2: resilient media-file decoding

File import now tries Chromium decoding first and automatically falls back to a
bundled FFmpeg 6 decoder. The fallback normalizes supported audio and video
containers to mono 16 kHz float PCM before the existing quiet-boundary segmenter
and speech pipeline run.

Verified locally:

- TypeScript build passed.
- Audio segmentation tests passed.
- Production Electron build passed.
- A generated AAC-in-M4A input decoded to mono 16 kHz float PCM.
- The packaged application contains an executable unpacked FFmpeg binary.
- The installed 3.9.2 application passed strict deep signature verification.

The decoder accepts AAC, AIFF, FLAC, M4A, MKA, MKV, MOV, MP3, MP4, OGA, OGG,
Opus, WAV, WebM and WMA. Imports are capped at six decoded hours and decoding is
terminated after ten minutes so corrupt inputs cannot occupy the app forever.
