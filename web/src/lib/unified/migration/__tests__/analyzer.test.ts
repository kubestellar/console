import { describe, it, expect } from 'vitest'
import {
  analyzeCard,
  analyzeCards,
  getAllKnownCardTypes,
  getMigrationCandidates,
  isHookRegistered,
} from '../analyzer'

describe('analyzeCard', () => {
  it('returns non-candidate for game cards', () => {
    const analysis = analyzeCard('kube_man')
    expect(analysis.isMigrationCandidate).toBe(false)
    expect(analysis.complexity).toBe('custom')
  })

  it('returns simple analysis for unified pattern cards', () => {
    const analysis = analyzeCard('pod_issues')
    expect(analysis.isMigrationCandidate).toBe(true)
    expect(analysis.complexity).toBe('simple')
    expect(analysis.visualizationType).toBe('list')
    expect(analysis.estimatedEffort).toBe(0.5)
  })

  it('returns chart analysis for chart cards', () => {
    const analysis = analyzeCard('events_timeline')
    expect(analysis.isMigrationCandidate).toBe(true)
    expect(analysis.complexity).toBe('moderate')
    expect(analysis.visualizationType).toBe('chart')
  })

  it('returns complex analysis for complex cards', () => {
    const analysis = analyzeCard('cluster_locations')
    expect(analysis.isMigrationCandidate).toBe(true)
    expect(analysis.complexity).toBe('complex')
  })

  it('returns moderate for unknown cards', () => {
    const analysis = analyzeCard('some_unknown_card_xyz')
    expect(analysis.isMigrationCandidate).toBe(true)
    expect(analysis.complexity).toBe('moderate')
  })

  it('normalizes card type (lowercases, replaces hyphens)', () => {
    const analysis = analyzeCard('Pod-Issues')
    expect(analysis.cardType).toBe('Pod-Issues')
  })

  it('generates component file name in PascalCase', () => {
    const analysis = analyzeCard('pod_issues')
    expect(analysis.componentFile).toBe('PodIssues.tsx')
  })

  it('includes data source info for known cards', () => {
    const analysis = analyzeCard('pod_issues')
    expect(analysis.dataSource).not.toBeNull()
    expect(analysis.dataSource?.hookName).toBe('useCachedPodIssues')
    expect(analysis.dataSource?.isCached).toBe(true)
  })

  it('detects patterns for unified cards', () => {
    const analysis = analyzeCard('deployment_issues')
    expect(analysis.patterns.usesCardData).toBe(true)
    expect(analysis.patterns.usesPagination).toBe(true)
    expect(analysis.patterns.usesSearch).toBe(true)
  })

  it('has false patterns for game cards', () => {
    const analysis = analyzeCard('kube_kong')
    expect(analysis.patterns.usesCardData).toBe(false)
    expect(analysis.patterns.usesPagination).toBe(false)
  })
})

describe('analyzeCards', () => {
  it('returns analyses for multiple cards', () => {
    const results = analyzeCards(['pod_issues', 'kube_man', 'events_timeline'])
    expect(results).toHaveLength(3)
    expect(results[0].complexity).toBe('simple')
    expect(results[1].isMigrationCandidate).toBe(false)
    expect(results[2].complexity).toBe('moderate')
  })
})

describe('getAllKnownCardTypes', () => {
  it('returns a sorted array of strings', () => {
    const types = getAllKnownCardTypes()
    expect(types.length).toBeGreaterThan(0)
    // Verify sorted
    for (let i = 1; i < types.length; i++) {
      expect(types[i] >= types[i - 1]).toBe(true)
    }
  })

  it('includes game and unified cards', () => {
    const types = getAllKnownCardTypes()
    expect(types).toContain('kube_man')
    expect(types).toContain('pod_issues')
  })
})

describe('getMigrationCandidates', () => {
  it('returns sorted candidates (excludes games)', () => {
    const candidates = getMigrationCandidates()
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates).not.toContain('kube_man')
    expect(candidates).toContain('pod_issues')
  })
})

describe('isHookRegistered', () => {
  it('returns true for known hooks', () => {
    expect(isHookRegistered('useCachedPodIssues')).toBe(true)
    expect(isHookRegistered('useClusters')).toBe(true)
  })

  it('returns false for unknown hooks', () => {
    expect(isHookRegistered('useUnknownHook')).toBe(false)
  })
})
