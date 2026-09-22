import { describe, expect, it } from 'vitest'
import { isNewerVersion, versionParts } from './release-version'

describe('release version comparison', () => {
  it('normalizes stable and beta tag prefixes', () => {
    expect(versionParts('v4.2.0')).toEqual([4, 2, 0])
    expect(versionParts('beta-v4.1.1')).toEqual([4, 1, 1])
  })

  it('accepts only a newer semantic version', () => {
    expect(isNewerVersion('4.1.2', '4.1.1')).toBe(true)
    expect(isNewerVersion('5.0.0', '4.9.9')).toBe(true)
    expect(isNewerVersion('4.1.1', '4.1.1')).toBe(false)
    expect(isNewerVersion('4.0.9', '4.1.1')).toBe(false)
  })
})
