import { describe, it, expect } from 'vitest'
import { getClusterDisplayName } from './clusterNames'

describe('getClusterDisplayName', () => {
  it('extracts display name from context/name format', () => {
    expect(getClusterDisplayName('default/my-cluster')).toBe('my-cluster')
  })

  it('handles cluster name with multiple slashes', () => {
    expect(getClusterDisplayName('context/namespace/cluster')).toBe('cluster')
  })

  it('returns original cluster if no separator found', () => {
    expect(getClusterDisplayName('standalone-cluster')).toBe('standalone-cluster')
  })

  it('returns empty string for undefined input', () => {
    expect(getClusterDisplayName(undefined)).toBe('')
  })

  it('returns empty string for empty string input', () => {
    expect(getClusterDisplayName('')).toBe('')
  })

  it('handles cluster name ending with slash', () => {
    expect(getClusterDisplayName('context/')).toBe('')
  })

  it('handles cluster name with only slash', () => {
    expect(getClusterDisplayName('/')).toBe('')
  })

  it('handles typical minikube format', () => {
    expect(getClusterDisplayName('minikube/local-dev')).toBe('local-dev')
  })

  it('handles typical GKE format', () => {
    expect(getClusterDisplayName('gke_project_zone_cluster/prod-cluster')).toBe('prod-cluster')
  })

  it('preserves special characters in display name', () => {
    expect(getClusterDisplayName('ctx/cluster-name_with.special-chars')).toBe('cluster-name_with.special-chars')
  })
})
