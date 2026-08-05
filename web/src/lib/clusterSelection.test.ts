import { describe, it, expect } from 'vitest'
import { getDefaultClusterSelection } from './clusterSelection'

describe('getDefaultClusterSelection', () => {
  it('returns empty string for null input', () => {
    expect(getDefaultClusterSelection(null)).toBe('')
  })

  it('returns empty string for undefined input', () => {
    expect(getDefaultClusterSelection(undefined)).toBe('')
  })

  it('returns empty string for empty array', () => {
    expect(getDefaultClusterSelection([])).toBe('')
  })

  describe('string array input', () => {
    it('returns the sole cluster when there is exactly one', () => {
      expect(getDefaultClusterSelection(['only-cluster'])).toBe('only-cluster')
    })

    it('trims whitespace on the sole cluster', () => {
      expect(getDefaultClusterSelection(['  only  '])).toBe('only')
    })

    it('returns empty string when multiple clusters are provided without a current marker', () => {
      expect(getDefaultClusterSelection(['a', 'b'])).toBe('')
    })
  })

  describe('candidate object input', () => {
    it('returns the cluster marked isCurrent when present', () => {
      expect(
        getDefaultClusterSelection([
          { name: 'alpha', isCurrent: false },
          { name: 'beta', isCurrent: true },
          { name: 'gamma', isCurrent: false },
        ]),
      ).toBe('beta')
    })

    it('trims whitespace on the current cluster name', () => {
      expect(
        getDefaultClusterSelection([
          { name: '  beta  ', isCurrent: true },
          { name: 'gamma' },
        ]),
      ).toBe('beta')
    })

    it('ignores isCurrent when the name is empty/whitespace-only', () => {
      expect(
        getDefaultClusterSelection([
          { name: '   ', isCurrent: true },
          { name: 'gamma' },
        ]),
      ).toBe('')
    })

    it('ignores isCurrent when the name is null', () => {
      expect(
        getDefaultClusterSelection([
          { name: null, isCurrent: true },
          { name: 'gamma' },
        ]),
      ).toBe('')
    })

    it('returns the sole cluster candidate when there is exactly one', () => {
      expect(getDefaultClusterSelection([{ name: 'solo' }])).toBe('solo')
    })

    it('returns empty when the sole cluster has no name', () => {
      expect(getDefaultClusterSelection([{ name: null }])).toBe('')
    })

    it('returns the first matching isCurrent when multiple are marked', () => {
      expect(
        getDefaultClusterSelection([
          { name: 'first', isCurrent: true },
          { name: 'second', isCurrent: true },
        ]),
      ).toBe('first')
    })

    it('returns empty string with multiple candidates and no isCurrent flag', () => {
      expect(
        getDefaultClusterSelection([
          { name: 'a' },
          { name: 'b' },
        ]),
      ).toBe('')
    })

    it('treats isCurrent === true strictly (not any truthy value)', () => {
      expect(
        getDefaultClusterSelection([
          // @ts-expect-error - deliberate loose input to verify strict === true check
          { name: 'first', isCurrent: 1 },
          { name: 'second' },
        ]),
      ).toBe('')
    })
  })
})
