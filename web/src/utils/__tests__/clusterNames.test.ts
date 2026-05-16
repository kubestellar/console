import { describe, it, expect } from 'vitest'
import { getClusterDisplayName } from '../clusterNames'

describe('getClusterDisplayName', () => {
  it('returns empty string for undefined', () => {
    expect(getClusterDisplayName(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(getClusterDisplayName('')).toBe('')
  })

  it('extracts name portion after slash', () => {
    expect(getClusterDisplayName('default/my-cluster')).toBe('my-cluster')
  })

  it('returns original string when no slash present', () => {
    expect(getClusterDisplayName('my-cluster')).toBe('my-cluster')
  })

  it('extracts last segment from multi-segment path', () => {
    expect(getClusterDisplayName('ctx/ns/my-cluster')).toBe('my-cluster')
  })

  it('handles trailing slash by returning empty string fallback to original', () => {
    // 'ctx/'.split('/').pop() === '' which is falsy, falls back to original
    expect(getClusterDisplayName('ctx/')).toBe('ctx/')
  })

  it('handles single slash', () => {
    expect(getClusterDisplayName('context/cluster-name')).toBe('cluster-name')
  })

  it('preserves hyphens and dots in the cluster name', () => {
    expect(getClusterDisplayName('prod/eks-us-east-1.cluster')).toBe('eks-us-east-1.cluster')
  })
})
