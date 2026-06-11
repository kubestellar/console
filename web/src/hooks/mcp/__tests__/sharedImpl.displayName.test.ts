import { describe, it, expect } from 'vitest'
import { clusterDisplayName } from '../sharedImpl'

describe('clusterDisplayName', () => {
  it('returns short names unchanged', () => {
    expect(clusterDisplayName('prod-east')).toBe('prod-east')
  })

  it('strips context prefix (slash-separated)', () => {
    expect(clusterDisplayName('context/my-cluster')).toBe('my-cluster')
  })

  it('strips multi-level prefix', () => {
    expect(clusterDisplayName('org/team/cluster-a')).toBe('cluster-a')
  })

  it('truncates long names with multiple segments to 3 segments', () => {
    // 25+ chars with segments separated by dashes
    const long = 'very-long-cluster-name-that-exceeds-limit'
    const result = clusterDisplayName(long)
    expect(result).toBe('very-long-cluster')
  })

  it('truncates long names with few segments by slicing', () => {
    // 25+ chars with only 2 segments
    const long = 'abcdefghijklmnopqrstuvwxyz_suffix'
    const result = clusterDisplayName(long)
    expect(result).toBe('abcdefghijklmnopqrstuvw…')
    expect(result.length).toBeLessThanOrEqual(24)
  })

  it('handles exactly 24-char names without truncation', () => {
    const exact = 'a'.repeat(24)
    expect(clusterDisplayName(exact)).toBe(exact)
  })

  it('handles 25-char names with 3+ segments', () => {
    // "a-b-c-d-e-f-g-h-i-j-k-l" is 23 chars, let's make 25
    const name = 'segment1-segment2-segment3'
    expect(name.length).toBeGreaterThan(24)
    const result = clusterDisplayName(name)
    expect(result).toBe('segment1-segment2-segment3'.split('-').slice(0, 3).join('-'))
  })

  it('handles dot-separated long names', () => {
    const name = 'my.really.long.cluster.name.here'
    expect(name.length).toBeGreaterThan(24)
    const result = clusterDisplayName(name)
    expect(result).toBe('my-really-long')
  })

  it('handles underscore-separated long names', () => {
    const name = 'my_really_long_cluster_name'
    expect(name.length).toBeGreaterThan(24)
    const result = clusterDisplayName(name)
    expect(result).toBe('my-really-long')
  })

  it('handles empty string', () => {
    expect(clusterDisplayName('')).toBe('')
  })

  it('handles single slash (empty base)', () => {
    expect(clusterDisplayName('prefix/')).toBe('')
  })
})
