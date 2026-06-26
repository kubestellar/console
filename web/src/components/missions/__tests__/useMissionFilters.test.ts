import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MissionExport, MissionMatch } from '../../../lib/missions/types'
import { useMissionFilters } from '../useMissionFilters'

function makeMission(overrides: Partial<MissionExport> = {}): MissionExport {
  return {
    id: 'test-mission',
    title: 'Test Mission',
    description: 'A test mission',
    type: 'fixer',
    source: 'community',
    content: '',
    tags: [],
    version: '1.0',
    author: 'test',
    ...overrides,
  } as unknown as MissionExport
}

function makeMatch(mission: MissionExport, score = 0.8, matchPercent?: number): MissionMatch {
  return { mission, score, matchPercent: matchPercent ?? Math.round(score * 100), reason: 'test' } as unknown as MissionMatch
}

const INSTALLER = makeMission({ id: 'inst-1', title: 'Istio Installer', type: 'installer', category: 'Networking', tags: ['graduated'] })
const INSTALLER2 = makeMission({ id: 'inst-2', title: 'Envoy Proxy', type: 'installer', category: 'Storage', tags: ['sandbox'] })
const FIXER = makeMission({ id: 'fix-1', title: 'Fix DNS', type: 'fixer' })
const FIXER2 = makeMission({ id: 'fix-2', title: 'Fix Network', type: 'troubleshoot' })
const MATCH_HIGH = makeMatch(FIXER, 0.9, 90)
const MATCH_LOW = makeMatch(FIXER2, 0.1, 10)

function renderFilters(
  recommendations: MissionMatch[] = [],
  installerMissions: MissionExport[] = [],
  fixerMissions: MissionExport[] = [],
) {
  return renderHook(() => useMissionFilters({ recommendations, installerMissions, fixerMissions }))
}

describe('useMissionFilters', () => {
  beforeEach(() => { vi.clearAllMocks() })

  // ── Initial state ─────────────────────────────────────────────────────────

  it('initialises searchQuery to empty string', () => {
    const { result } = renderFilters()
    expect(result.current.searchQuery).toBe('')
  })

  it('initialises all category/type filters to "All"', () => {
    const { result } = renderFilters()
    expect(result.current.categoryFilter).toBe('All')
    expect(result.current.installerCategoryFilter).toBe('All')
    expect(result.current.installerMaturityFilter).toBe('All')
    expect(result.current.fixerTypeFilter).toBe('All')
    expect(result.current.maturityFilter).toBe('All')
    expect(result.current.missionClassFilter).toBe('All')
    expect(result.current.difficultyFilter).toBe('All')
  })

  it('initialises matchSourceFilter to "all"', () => {
    const { result } = renderFilters()
    expect(result.current.matchSourceFilter).toBe('all')
  })

  it('initialises minMatchPercent to 25', () => {
    const { result } = renderFilters()
    expect(result.current.minMatchPercent).toBe(25)
  })

  it('initialises selectedTags to empty Set', () => {
    const { result } = renderFilters()
    expect(result.current.selectedTags.size).toBe(0)
  })

  it('initialises cncfFilter to empty string', () => {
    const { result } = renderFilters()
    expect(result.current.cncfFilter).toBe('')
  })

  it('initialises installerSearch and fixerSearch to empty strings', () => {
    const { result } = renderFilters()
    expect(result.current.installerSearch).toBe('')
    expect(result.current.fixerSearch).toBe('')
  })

  // ── handleInstallerSearchChange ───────────────────────────────────────────

  it('handleInstallerSearchChange updates installerSearch', () => {
    const { result } = renderFilters([], [INSTALLER], [])
    act(() => { result.current.handleInstallerSearchChange('istio') })
    expect(result.current.installerSearch).toBe('istio')
  })

  it('handleInstallerSearchChange clears searchQuery when both would be set', () => {
    const { result } = renderFilters([], [INSTALLER], [])
    act(() => { result.current.setSearchQuery('global') })
    act(() => { result.current.handleInstallerSearchChange('istio') })
    expect(result.current.searchQuery).toBe('')
    expect(result.current.installerSearch).toBe('istio')
  })

  it('handleInstallerSearchChange does not clear searchQuery when empty value passed', () => {
    const { result } = renderFilters([], [INSTALLER], [])
    act(() => { result.current.setSearchQuery('global') })
    act(() => { result.current.handleInstallerSearchChange('') })
    expect(result.current.searchQuery).toBe('global')
  })

  // ── handleFixerSearchChange ───────────────────────────────────────────────

  it('handleFixerSearchChange updates fixerSearch', () => {
    const { result } = renderFilters([], [], [FIXER])
    act(() => { result.current.handleFixerSearchChange('dns') })
    expect(result.current.fixerSearch).toBe('dns')
  })

  it('handleFixerSearchChange clears searchQuery when both would be set', () => {
    const { result } = renderFilters([], [], [FIXER])
    act(() => { result.current.setSearchQuery('global') })
    act(() => { result.current.handleFixerSearchChange('dns') })
    expect(result.current.searchQuery).toBe('')
    expect(result.current.fixerSearch).toBe('dns')
  })

  it('handleFixerSearchChange does not clear searchQuery when empty value passed', () => {
    const { result } = renderFilters([], [], [FIXER])
    act(() => { result.current.setSearchQuery('global') })
    act(() => { result.current.handleFixerSearchChange('') })
    expect(result.current.searchQuery).toBe('global')
  })

  // ── filteredInstallers ────────────────────────────────────────────────────

  it('filteredInstallers returns all missions when no filters set', () => {
    const { result } = renderFilters([], [INSTALLER, INSTALLER2], [])
    expect(result.current.filteredInstallers).toHaveLength(2)
  })

  it('filteredInstallers filters by category', () => {
    const { result } = renderFilters([], [INSTALLER, INSTALLER2], [])
    act(() => { result.current.setInstallerCategoryFilter('Networking') })
    expect(result.current.filteredInstallers).toHaveLength(1)
    expect(result.current.filteredInstallers[0].id).toBe('inst-1')
  })

  it('filteredInstallers filters by maturity tag', () => {
    const { result } = renderFilters([], [INSTALLER, INSTALLER2], [])
    act(() => { result.current.setInstallerMaturityFilter('graduated') })
    expect(result.current.filteredInstallers).toHaveLength(1)
    expect(result.current.filteredInstallers[0].id).toBe('inst-1')
  })

  it('filteredInstallers filters by local installerSearch text', () => {
    const { result } = renderFilters([], [INSTALLER, INSTALLER2], [])
    act(() => { result.current.handleInstallerSearchChange('istio') })
    expect(result.current.filteredInstallers).toHaveLength(1)
    expect(result.current.filteredInstallers[0].id).toBe('inst-1')
  })

  it('filteredInstallers uses global searchQuery when installerSearch is empty', () => {
    const { result } = renderFilters([], [INSTALLER, INSTALLER2], [])
    act(() => { result.current.setSearchQuery('istio') })
    expect(result.current.filteredInstallers).toHaveLength(1)
    expect(result.current.filteredInstallers[0].id).toBe('inst-1')
  })

  // ── filteredFixers ────────────────────────────────────────────────────────

  it('filteredFixers returns all fixers when no filters set', () => {
    const { result } = renderFilters([], [], [FIXER, FIXER2])
    expect(result.current.filteredFixers).toHaveLength(2)
  })

  it('filteredFixers filters by type', () => {
    const { result } = renderFilters([], [], [FIXER, FIXER2])
    act(() => { result.current.setFixerTypeFilter('troubleshoot') })
    expect(result.current.filteredFixers).toHaveLength(1)
    expect(result.current.filteredFixers[0].id).toBe('fix-2')
  })

  it('filteredFixers filters by local fixerSearch text', () => {
    const { result } = renderFilters([], [], [FIXER, FIXER2])
    act(() => { result.current.handleFixerSearchChange('dns') })
    expect(result.current.filteredFixers).toHaveLength(1)
    expect(result.current.filteredFixers[0].id).toBe('fix-1')
  })

  it('filteredFixers uses global searchQuery when fixerSearch is empty', () => {
    const { result } = renderFilters([], [], [FIXER, FIXER2])
    act(() => { result.current.setSearchQuery('network') })
    expect(result.current.filteredFixers).toHaveLength(1)
    expect(result.current.filteredFixers[0].id).toBe('fix-2')
  })

  // ── filteredRecommendations ───────────────────────────────────────────────

  it('filteredRecommendations returns all at 0% minMatchPercent', () => {
    const { result } = renderFilters([MATCH_HIGH, MATCH_LOW], [], [FIXER, FIXER2])
    act(() => { result.current.setMinMatchPercent(0) })
    expect(result.current.filteredRecommendations).toHaveLength(2)
  })

  it('filteredRecommendations filters out low-score matches', () => {
    const { result } = renderFilters([MATCH_HIGH, MATCH_LOW], [], [FIXER, FIXER2])
    act(() => { result.current.setMinMatchPercent(50) })
    expect(result.current.filteredRecommendations).toHaveLength(1)
    expect(result.current.filteredRecommendations[0].mission.id).toBe('fix-1')
  })

  it('filteredRecommendations filters by text searchQuery', () => {
    const { result } = renderFilters([MATCH_HIGH, MATCH_LOW], [], [FIXER, FIXER2])
    act(() => {
      result.current.setMinMatchPercent(0)
      result.current.setSearchQuery('dns')
    })
    expect(result.current.filteredRecommendations).toHaveLength(1)
    expect(result.current.filteredRecommendations[0].mission.id).toBe('fix-1')
  })

  // ── clearAllFilters ───────────────────────────────────────────────────────

  it('clearAllFilters resets all filter state to defaults', () => {
    const { result } = renderFilters([MATCH_HIGH], [INSTALLER], [FIXER])
    act(() => {
      result.current.setMinMatchPercent(80)
      result.current.setCategoryFilter('Networking')
      result.current.setMaturityFilter('graduated')
      result.current.setMissionClassFilter('installer')
      result.current.setDifficultyFilter('easy')
      result.current.setMatchSourceFilter('cluster')
      result.current.setCncfFilter('prometheus')
      result.current.setSearchQuery('test')
      result.current.setSelectedTags(new Set(['tag1']))
    })
    act(() => { result.current.clearAllFilters() })
    expect(result.current.minMatchPercent).toBe(0)
    expect(result.current.categoryFilter).toBe('All')
    expect(result.current.maturityFilter).toBe('All')
    expect(result.current.missionClassFilter).toBe('All')
    expect(result.current.difficultyFilter).toBe('All')
    expect(result.current.matchSourceFilter).toBe('all')
    expect(result.current.cncfFilter).toBe('')
    expect(result.current.searchQuery).toBe('')
    expect(result.current.selectedTags.size).toBe(0)
  })

  // ── activeFilterCount ─────────────────────────────────────────────────────

  it('activeFilterCount increases when a filter is set', () => {
    const { result } = renderFilters()
    const initial = result.current.activeFilterCount
    act(() => { result.current.setCategoryFilter('Networking') })
    expect(result.current.activeFilterCount).toBeGreaterThan(initial)
  })

  it('activeFilterCount decreases after clearAllFilters', () => {
    const { result } = renderFilters()
    act(() => {
      result.current.setCategoryFilter('Networking')
      result.current.setMaturityFilter('graduated')
    })
    const withFilters = result.current.activeFilterCount
    act(() => { result.current.clearAllFilters() })
    expect(result.current.activeFilterCount).toBeLessThan(withFilters)
  })

  // ── setSelectedTags ───────────────────────────────────────────────────────

  it('setSelectedTags updates the tag Set', () => {
    const { result } = renderFilters()
    act(() => { result.current.setSelectedTags(new Set(['k8s', 'network'])) })
    expect(result.current.selectedTags.has('k8s')).toBe(true)
    expect(result.current.selectedTags.has('network')).toBe(true)
  })

  // ── facetCounts ───────────────────────────────────────────────────────────

  it('facetCounts is defined for empty recommendations', () => {
    const { result } = renderFilters()
    expect(result.current.facetCounts).toBeDefined()
  })

  it('facetCounts is defined when recommendations are present', () => {
    const { result } = renderFilters([MATCH_HIGH])
    expect(result.current.facetCounts).toBeDefined()
  })
})
