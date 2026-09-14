import { describe, expect, it } from 'vitest'
import { isVirtualAudioDevice } from './VirtualMicSettings'

describe('isVirtualAudioDevice', () => {
  it('detects common virtual microphone output devices', () => {
    expect(isVirtualAudioDevice('BlackHole 2ch')).toBe(true)
    expect(isVirtualAudioDevice('VB-Audio Virtual Cable')).toBe(true)
    expect(isVirtualAudioDevice('Loopback Audio')).toBe(true)
  })

  it('does not route TTS to physical speakers automatically', () => {
    expect(isVirtualAudioDevice('MacBook Air Speakers')).toBe(false)
    expect(isVirtualAudioDevice('AirPods Pro')).toBe(false)
  })
})
