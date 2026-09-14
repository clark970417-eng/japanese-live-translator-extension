import { describe, expect, it } from 'vitest'
import { MEDIA_FILE_ACCEPT, SUPPORTED_MEDIA_EXTENSIONS, isSupportedMediaFile } from './media-formats'

describe('media file format catalog', () => {
  it.each(['clip.MP3', 'movie.avi', 'stream.ts', 'voice.caf', 'camera.m2ts', 'legacy.wmv'])(
    'accepts %s through bundled FFmpeg',
    (path) => expect(isSupportedMediaFile(path)).toBe(true)
  )

  it('rejects files outside the explicit media allowlist', () => {
    expect(isSupportedMediaFile('notes.txt')).toBe(false)
    expect(isSupportedMediaFile('video.mp4.exe')).toBe(false)
  })

  it('keeps the file picker synchronized with the decoder allowlist', () => {
    for (const extension of SUPPORTED_MEDIA_EXTENSIONS) expect(MEDIA_FILE_ACCEPT).toContain(extension)
  })
})
