import { describe, expect, it } from 'vitest'

import { compareFlatcarVersions } from './versionUtils'

describe('compareFlatcarVersions', () => {
  describe('unknown handling', () => {
    it('sorts equal when both are "unknown"', () => {
      expect(compareFlatcarVersions('unknown', 'unknown')).toBe(0)
    })

    it('sorts "unknown" after any real version (a is unknown)', () => {
      expect(compareFlatcarVersions('unknown', '3.0.0')).toBeGreaterThan(0)
    })

    it('sorts real version before "unknown" (b is unknown)', () => {
      expect(compareFlatcarVersions('1.0.0', 'unknown')).toBeLessThan(0)
    })

    it('is case-sensitive — "Unknown" is NOT the sentinel and returns NaN', () => {
      // "Unknown" does not match the exact 'unknown' sentinel; Number('Unknown')
      // yields NaN and NaN - NaN is NaN. Documenting this so callers pass the
      // exact lowercase 'unknown' sentinel and never rely on other casings.
      expect(compareFlatcarVersions('Unknown', 'Unknown')).toBeNaN()
    })
  })

  describe('descending sort order', () => {
    it('returns negative when a > b (major)', () => {
      expect(compareFlatcarVersions('4.0.0', '3.0.0')).toBeLessThan(0)
    })

    it('returns positive when a < b (major)', () => {
      expect(compareFlatcarVersions('3.0.0', '4.0.0')).toBeGreaterThan(0)
    })

    it('returns negative when a > b (minor, same major)', () => {
      expect(compareFlatcarVersions('3.5.0', '3.4.0')).toBeLessThan(0)
    })

    it('returns positive when a < b (minor, same major)', () => {
      expect(compareFlatcarVersions('3.4.0', '3.5.0')).toBeGreaterThan(0)
    })

    it('returns negative when a > b (patch, same major.minor)', () => {
      expect(compareFlatcarVersions('3.4.10', '3.4.5')).toBeLessThan(0)
    })

    it('returns positive when a < b (patch, same major.minor)', () => {
      expect(compareFlatcarVersions('3.4.5', '3.4.10')).toBeGreaterThan(0)
    })

    it('returns 0 for identical versions', () => {
      expect(compareFlatcarVersions('3.4.5', '3.4.5')).toBe(0)
    })
  })

  describe('precedence: major > minor > patch', () => {
    it('major dominates minor and patch', () => {
      // 4.0.0 must come before 3.99.99
      expect(compareFlatcarVersions('4.0.0', '3.99.99')).toBeLessThan(0)
    })

    it('minor dominates patch when major is equal', () => {
      // 3.5.0 must come before 3.4.99
      expect(compareFlatcarVersions('3.5.0', '3.4.99')).toBeLessThan(0)
    })

    it('patch decides when major and minor are equal', () => {
      expect(compareFlatcarVersions('3.4.2', '3.4.1')).toBeLessThan(0)
    })
  })

  describe('short and malformed inputs', () => {
    it('treats missing minor/patch as 0 ("3" == "3.0.0")', () => {
      expect(compareFlatcarVersions('3', '3.0.0')).toBe(0)
    })

    it('treats missing patch as 0 ("3.4" == "3.4.0")', () => {
      expect(compareFlatcarVersions('3.4', '3.4.0')).toBe(0)
    })

    it('a partial higher-major version sorts before a full lower-major version', () => {
      expect(compareFlatcarVersions('4', '3.99.99')).toBeLessThan(0)
    })

    it('empty string parses as 0.0.0 and ties with "0.0.0"', () => {
      // '' split('.') → [''] → Number('') → NaN → default 0
      expect(compareFlatcarVersions('', '0.0.0')).toBe(0)
    })
  })

  describe('array sort usage', () => {
    it('sorts a mixed list in descending version order with unknown last', () => {
      const versions = ['3.4.1', 'unknown', '4.0.0', '3.5.0', '3.4.10', '3.4.1']
      versions.sort(compareFlatcarVersions)
      expect(versions).toEqual(['4.0.0', '3.5.0', '3.4.10', '3.4.1', '3.4.1', 'unknown'])
    })

    it('sorts a fleet of clusters with several unknowns to the end', () => {
      const versions = ['unknown', '3.4.5', 'unknown', '4.1.0', '3.4.5']
      versions.sort(compareFlatcarVersions)
      expect(versions).toEqual(['4.1.0', '3.4.5', '3.4.5', 'unknown', 'unknown'])
    })
  })
})
