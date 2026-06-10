import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  computeClusterFingerprint,
  getCachedRecommendations,
  setCachedRecommendations,
  resetRecommendationCache,
  resetMissionCache,
  missionCache,
} from '../missionCache'
import type { ClusterContext } from '../clusterContext'
import type { MissionMatch } from '../types'

describe('computeClusterFingerprint', () => {
  it('returns stable sentinel for null context', () => {
    const result = computeClusterFingerprint(null)
    expect(result).toBe('__no_cluster__')
  })

  it('produces deterministic output for same input', () => {
    const ctx: ClusterContext = {
      name: 'prod-1',
      provider: 'eks',
      version: '1.28',
      resources: ['pods', 'deployments'],
      issues: ['high-cpu'],
      labels: { env: 'prod', region: 'us-east-1' },
    }
    const a = computeClusterFingerprint(ctx)
    const b = computeClusterFingerprint(ctx)
    expect(a).toBe(b)
  })

  it('is stable regardless of array order', () => {
    const ctx1: ClusterContext = {
      name: 'test',
      resources: ['b', 'a', 'c'],
      issues: ['z', 'a'],
      labels: { x: '1', a: '2' },
    }
    const ctx2: ClusterContext = {
      name: 'test',
      resources: ['c', 'a', 'b'],
      issues: ['a', 'z'],
      labels: { a: '2', x: '1' },
    }
    expect(computeClusterFingerprint(ctx1)).toBe(computeClusterFingerprint(ctx2))
  })

  it('produces different fingerprints for different clusters', () => {
    const ctx1: ClusterContext = { name: 'a', resources: [], issues: [], labels: {} }
    const ctx2: ClusterContext = { name: 'b', resources: [], issues: [], labels: {} }
    expect(computeClusterFingerprint(ctx1)).not.toBe(computeClusterFingerprint(ctx2))
  })

  it('includes provider and version in fingerprint', () => {
    const base: ClusterContext = { name: 'x', resources: [], issues: [], labels: {} }
    const withProvider: ClusterContext = { ...base, provider: 'gke' }
    const withVersion: ClusterContext = { ...base, version: '1.29' }
    expect(computeClusterFingerprint(base)).not.toBe(computeClusterFingerprint(withProvider))
    expect(computeClusterFingerprint(base)).not.toBe(computeClusterFingerprint(withVersion))
  })
})

describe('recommendation cache', () => {
  const mockCtx: ClusterContext = {
    name: 'test-cluster',
    resources: ['pods'],
    issues: [],
    labels: {},
  }

  const mockRecommendations: MissionMatch[] = [
    { mission: { name: 'test-mission' } as MissionMatch['mission'], score: 0.9, matchPercent: 90, matchReasons: ['match'] },
  ]

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
    resetRecommendationCache()
    resetMissionCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when no cache exists', () => {
    expect(getCachedRecommendations(mockCtx)).toBeNull()
  })

  it('returns cached recommendations on valid hit', () => {
    setCachedRecommendations(mockRecommendations, mockCtx)
    const result = getCachedRecommendations(mockCtx)
    expect(result).toEqual(mockRecommendations)
  })

  it('invalidates cache after TTL expires', () => {
    setCachedRecommendations(mockRecommendations, mockCtx)
    // Advance past 10-minute TTL
    vi.advanceTimersByTime(10 * 60 * 1000 + 1)
    expect(getCachedRecommendations(mockCtx)).toBeNull()
  })

  it('invalidates cache when cluster context changes', () => {
    setCachedRecommendations(mockRecommendations, mockCtx)
    const differentCtx: ClusterContext = { ...mockCtx, name: 'other-cluster' }
    expect(getCachedRecommendations(differentCtx)).toBeNull()
  })

  it('invalidates cache when fixes count changes', () => {
    setCachedRecommendations(mockRecommendations, mockCtx)
    // Simulate new fixes arriving
    missionCache.fixes.push({ name: 'new-fix' } as MissionMatch['mission'])
    expect(getCachedRecommendations(mockCtx)).toBeNull()
  })

  it('resetRecommendationCache clears the cache', () => {
    setCachedRecommendations(mockRecommendations, mockCtx)
    resetRecommendationCache()
    expect(getCachedRecommendations(mockCtx)).toBeNull()
  })
})
