import { describe, expect, it } from 'vitest'
import {
  andMatch,
  computeFacetCounts,
  filterFixers,
  filterInstallers,
  filterRecommendations,
  matchesMission,
} from '../missionBrowserFilters'
import type { MissionExport, MissionMatch } from '../../../lib/missions/types'

function makeMission(overrides: Partial<MissionExport> = {}): MissionExport {
  return {
    version: 'v1',
    title: 'Install Istio',
    description: 'Deploy service mesh components',
    type: 'install',
    tags: ['networking', 'mesh'],
    steps: [],
    ...overrides,
  } as MissionExport
}

function makeRecommendation(
  missionOverrides: Partial<MissionExport>,
  score: number,
  matchPercent: number,
): MissionMatch {
  return {
    mission: makeMission(missionOverrides),
    score,
    matchPercent,
    matchReasons: [],
  }
}

describe('missionBrowserFilters', () => {
  it('supports AND token matching across search terms', () => {
    expect(andMatch('Install Istio Service Mesh', 'istio mesh')).toBe(true)
    expect(andMatch('Install Istio Service Mesh', 'istio kafka')).toBe(false)
  })

  it('matches mission text across title, description, and tags', () => {
    const mission = makeMission({ tags: ['security', 'policy'] })
    expect(matchesMission(mission, 'install')).toBe(true)
    expect(matchesMission(mission, 'policy')).toBe(true)
    expect(matchesMission(mission, 'unknown')).toBe(false)
  })

  it('filters installer missions by category, maturity, and text search', () => {
    const missions = [
      makeMission({ title: 'Install Istio', category: 'Deploy', tags: ['sandbox'] }),
      makeMission({ title: 'Repair DNS', category: 'Repair', tags: ['graduated'] }),
    ]

    const filtered = filterInstallers(missions, {
      categoryFilter: 'Deploy',
      maturityFilter: 'sandbox',
      search: 'istio',
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0].title).toBe('Install Istio')
  })

  it('filters fixer missions by type and search', () => {
    const missions = [
      makeMission({ title: 'DNS Fix', type: 'fix', tags: ['dns'] }),
      makeMission({ title: 'Install Cilium', type: 'install', tags: ['cni'] }),
    ]

    const filtered = filterFixers(missions, { typeFilter: 'FIX', search: 'dns' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].title).toBe('DNS Fix')
  })

  it('computes facet counts and top tags from recommendations', () => {
    const recs: MissionMatch[] = [
      makeRecommendation({ metadata: { maturity: 'sandbox' }, difficulty: 'easy', missionClass: 'installer', tags: ['mesh', 'security'] }, 2, 90),
      makeRecommendation({ metadata: { maturity: 'graduated' }, difficulty: 'hard', missionClass: 'fixer', tags: ['security'] }, 1, 60),
    ]

    const facets = computeFacetCounts(recs)
    expect(facets.clusterMatched).toBe(1)
    expect(facets.community).toBe(1)
    expect(facets.maturity.get('sandbox')).toBe(1)
    expect(facets.difficulty.get('hard')).toBe(1)
    expect(facets.topTags[0]).toEqual({ tag: 'security', count: 2 })
  })

  it('applies full recommendation filter pipeline', () => {
    const recs: MissionMatch[] = [
      makeRecommendation(
        {
          title: 'Istio policy hardening',
          description: 'Secure mesh traffic',
          type: 'deploy',
          metadata: { maturity: 'sandbox' },
          missionClass: 'installer',
          difficulty: 'easy',
          tags: ['security', 'mesh'],
          cncfProject: 'Istio',
        },
        3,
        80,
      ),
      makeRecommendation(
        {
          title: 'Cilium diagnostics',
          description: 'Troubleshoot CNI',
          type: 'analyze',
          metadata: { maturity: 'graduated' },
          missionClass: 'fixer',
          difficulty: 'hard',
          tags: ['networking'],
          cncfProject: 'Cilium',
        },
        1,
        40,
      ),
    ]

    const filtered = filterRecommendations(recs, {
      minMatchPercent: 75,
      matchSourceFilter: 'cluster',
      categoryFilter: 'Deploy',
      maturityFilter: 'sandbox',
      missionClassFilter: 'installer',
      difficultyFilter: 'easy',
      selectedTags: new Set(['security']),
      cncfFilter: 'istio',
      searchQuery: 'policy',
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0].mission.title).toContain('Istio')
  })
})
