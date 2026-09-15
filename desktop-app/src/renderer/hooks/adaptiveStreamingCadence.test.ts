import { describe, expect, it } from 'vitest'
import { getAdaptiveStreamingDelay } from './adaptiveStreamingCadence'

describe('getAdaptiveStreamingDelay', () => {
  it('gets the first hypothesis out within 500ms', () => {
    expect(getAdaptiveStreamingDelay(800, 0)).toBe(500)
  })

  it('uses the selected cadence for an ordinary utterance', () => {
    expect(getAdaptiveStreamingDelay(800, 2500)).toBe(800)
  })

  it('backs off during long speech to avoid redundant queueing', () => {
    expect(getAdaptiveStreamingDelay(800, 6000)).toBe(1100)
  })

  it('preserves a user-selected 500ms low-latency cadence', () => {
    expect(getAdaptiveStreamingDelay(500, 0)).toBe(500)
  })
})
