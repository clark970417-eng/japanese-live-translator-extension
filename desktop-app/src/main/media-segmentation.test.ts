import { describe, expect, it } from 'vitest'
import { findQuietSegmentEnd } from './media-segmentation'

describe('streamed media segmentation', () => {
  it('keeps a short final segment intact', () => {
    expect(findQuietSegmentEnd(new Float32Array(500), 100, 10, 4)).toBe(500)
  })

  it('cuts a full segment at the quietest window near its end', () => {
    const audio = new Float32Array(1_000).fill(0.5)
    audio.fill(0, 760, 780)
    expect(findQuietSegmentEnd(audio, 100, 10, 4)).toBe(762)
  })

  it('never searches before the configured tail window', () => {
    const audio = new Float32Array(1_000).fill(0.5)
    audio.fill(0, 100, 120)
    expect(findQuietSegmentEnd(audio, 100, 10, 2)).toBeGreaterThanOrEqual(800)
  })
})
