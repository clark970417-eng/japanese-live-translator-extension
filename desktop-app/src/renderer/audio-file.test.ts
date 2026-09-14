import { describe, expect, it } from 'vitest'
import { splitAudioNearSilence } from './audio-file'

describe('splitAudioNearSilence', () => {
  it('keeps short recordings intact', () => {
    const audio = new Float32Array(16_000)
    expect(splitAudioNearSilence(audio)).toHaveLength(1)
  })

  it('selects a quiet boundary near the segment limit', () => {
    const rate = 100
    const audio = new Float32Array(3_000).fill(0.8)
    audio.fill(0, 1_900, 1_950)
    const parts = splitAudioNearSilence(audio, rate, 20, 2)
    expect(parts).toHaveLength(2)
    expect(parts[0].length).toBeGreaterThanOrEqual(1_900)
    expect(parts[0].length).toBeLessThanOrEqual(1_952)
    expect(parts.reduce((sum, part) => sum + part.length, 0)).toBe(audio.length)
  })
})
