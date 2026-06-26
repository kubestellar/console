import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { MissionExport, MissionMatch } from '../../../lib/missions/types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockMissionCache, mockGetCachedRecommendations, mockSetCachedRecommendations, mockStartMissionCacheFetch, mockMatchMissionsToCluster } = vi.hoisted(() => ({
  mockMissionCache: {
    installers: [] as MissionExport[],
    fixes: [] as MissionExport[],
    fetchError: null as string | null,
    installersDone: false,
    fixesDone: false,
    listeners: new Set<() => void>(),
  },
  mockGetCachedRecommendations: vi.fn<() => MissionMatch[] | null>(() => null),
  mockSetCachedRecommendations: vi.fn(),
  mockStartMissionCacheFetch: vi.fn(),
  mockMatchMissionsToCluster: vi.fn<() => MissionMatch[]>(() => []),
}))

vi.mock('../browser', () => ({
  missionCache: mockMissionCache,
  getCachedRecommendations: mockGetCachedRecommendations,
  setCachedRecommendations: mockSetCachedRecommendations,
  startMissionCacheFetch: mockStartMissionCacheFetch,
}))

vi.mock('../../../lib/missions/matcher', () => ({
  matchMissionsToCluster: mockMatchMissionsToCluster,
}))

import { useMissionRecommendations } from '../useMissionRecommendations'

const FIXER: MissionExport = {
  id: 'fix-1',
  title: 'Fix DNS',
  type: 'fixer',
} as unknown as MissionExport

const FIXER2: MissionExport = {
  id: 'fix-2',
  title: 'Fix Network',
  type: 'fixer',
} as unknown as MissionExport

const INSTALLER: MissionExport = {
  id: 'inst-1',
  title: 'Install Istio',
  type: 'installer',
} as unknown as MissionExport

const MATCH: MissionMatch = { mission: FIXER, score: 0.9, reason: 'cluster match' } as unknown as MissionMatch

describe('useMissionRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMissionCache.installers = []
    mockMissionCache.fixes = []
    mockMissionCache.fetchError = null
    mockMissionCache.installersDone = false
    mockMissionCache.fixesDone = false
    mockMissionCache.listeners = new Set()
    mockGetCachedRecommendations.mockReturnValue(null)
    mockMatchMissionsToCluster.mockReturnValue([])
  })

  // ── isOpen=false guard ─────────────────────────────────────────────────────

  it('does not call startMissionCacheFetch when isOpen=false', () => {
    renderHook(() => useMissionRecommendations(false, null))
    expect(mockStartMissionCacheFetch).not.toHaveBeenCalled()
  })

  it('returns empty recommendations when isOpen=false', () => {
    const { result } = renderHook(() => useMissionRecommendations(false, null))
    expect(result.current.recommendations).toHaveLength(0)
  })

  it('returns empty installer and fixer missions when isOpen=false', () => {
    const { result } = renderHook(() => useMissionRecommendations(false, null))
    expect(result.current.installerMissions).toHaveLength(0)
    expect(result.current.fixerMissions).toHaveLength(0)
  })

  it('does not register listeners when isOpen=false', () => {
    renderHook(() => useMissionRecommendations(false, null))
    expect(mockMissionCache.listeners.size).toBe(0)
  })

  // ── isOpen=true bootstrap ─────────────────────────────────────────────────

  it('calls startMissionCacheFetch when isOpen=true', () => {
    renderHook(() => useMissionRecommendations(true, null))
    expect(mockStartMissionCacheFetch).toHaveBeenCalledTimes(1)
  })

  it('registers listeners on missionCache when isOpen=true', () => {
    renderHook(() => useMissionRecommendations(true, null))
    expect(mockMissionCache.listeners.size).toBeGreaterThan(0)
  })

  it('removes all listeners on unmount', () => {
    const { unmount } = renderHook(() => useMissionRecommendations(true, null))
    unmount()
    expect(mockMissionCache.listeners.size).toBe(0)
  })

  // ── loadingRecommendations ─────────────────────────────────────────────────

  it('sets loadingRecommendations=true when fixes empty and fixesDone=false', () => {
    mockMissionCache.fixes = []
    mockMissionCache.fixesDone = false
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.loadingRecommendations).toBe(true)
  })

  it('sets loadingRecommendations=false when fixes available', () => {
    mockMissionCache.fixes = [FIXER]
    mockMissionCache.fixesDone = true
    mockMatchMissionsToCluster.mockReturnValue([MATCH])
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.loadingRecommendations).toBe(false)
  })

  // ── recommendations via cache ─────────────────────────────────────────────

  it('uses cached recommendations when getCachedRecommendations returns a value', () => {
    mockMissionCache.fixes = [FIXER]
    mockGetCachedRecommendations.mockReturnValue([MATCH])
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.recommendations).toEqual([MATCH])
    expect(mockMatchMissionsToCluster).not.toHaveBeenCalled()
  })

  it('calls matchMissionsToCluster when no cached recommendations', () => {
    mockMissionCache.fixes = [FIXER]
    mockGetCachedRecommendations.mockReturnValue(null)
    mockMatchMissionsToCluster.mockReturnValue([MATCH])
    renderHook(() => useMissionRecommendations(true, null))
    expect(mockMatchMissionsToCluster).toHaveBeenCalledWith([FIXER], null)
  })

  it('sets recommendations from matchMissionsToCluster result', () => {
    mockMissionCache.fixes = [FIXER]
    mockGetCachedRecommendations.mockReturnValue(null)
    mockMatchMissionsToCluster.mockReturnValue([MATCH])
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.recommendations).toEqual([MATCH])
  })

  it('calls setCachedRecommendations after matching', () => {
    mockMissionCache.fixes = [FIXER]
    mockGetCachedRecommendations.mockReturnValue(null)
    mockMatchMissionsToCluster.mockReturnValue([MATCH])
    renderHook(() => useMissionRecommendations(true, null))
    expect(mockSetCachedRecommendations).toHaveBeenCalledWith([MATCH], null)
  })

  it('passes clusterContext to matchMissionsToCluster', () => {
    mockMissionCache.fixes = [FIXER]
    mockGetCachedRecommendations.mockReturnValue(null)
    const cluster = { name: 'prod-cluster' } as any
    renderHook(() => useMissionRecommendations(true, cluster))
    expect(mockMatchMissionsToCluster).toHaveBeenCalledWith([FIXER], cluster)
  })

  // ── hasCluster ─────────────────────────────────────────────────────────────

  it('hasCluster=false when clusterContext is null', () => {
    mockMissionCache.fixes = [FIXER]
    mockMatchMissionsToCluster.mockReturnValue([MATCH])
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.hasCluster).toBe(false)
  })

  it('hasCluster=true when clusterContext is provided', () => {
    mockMissionCache.fixes = [FIXER]
    mockMatchMissionsToCluster.mockReturnValue([MATCH])
    const cluster = { name: 'test-cluster' } as any
    const { result } = renderHook(() => useMissionRecommendations(true, cluster))
    expect(result.current.hasCluster).toBe(true)
  })

  // ── loadingInstallers / loadingFixers ──────────────────────────────────────

  it('loadingInstallers=true when installersDone=false', () => {
    mockMissionCache.installersDone = false
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.loadingInstallers).toBe(true)
  })

  it('loadingInstallers=false when installersDone=true', () => {
    mockMissionCache.installersDone = true
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.loadingInstallers).toBe(false)
  })

  it('loadingFixers=true when fixesDone=false', () => {
    mockMissionCache.fixesDone = false
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.loadingFixers).toBe(true)
  })

  it('loadingFixers=false when fixesDone=true', () => {
    mockMissionCache.fixesDone = true
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.loadingFixers).toBe(false)
  })

  // ── missionFetchError ──────────────────────────────────────────────────────

  it('reflects fetchError from cache', () => {
    mockMissionCache.fetchError = 'rate limited'
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.missionFetchError).toBe('rate limited')
  })

  it('missionFetchError is null when cache has no error', () => {
    mockMissionCache.fetchError = null
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.missionFetchError).toBeNull()
  })

  // ── initial installer/fixer lists from cache ───────────────────────────────

  it('initialises installerMissions from missionCache.installers', () => {
    mockMissionCache.installers = [INSTALLER]
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.installerMissions).toHaveLength(1)
    expect(result.current.installerMissions[0].id).toBe('inst-1')
  })

  it('initialises fixerMissions from missionCache.fixes', () => {
    mockMissionCache.fixes = [FIXER]
    mockMatchMissionsToCluster.mockReturnValue([MATCH])
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.fixerMissions).toHaveLength(1)
    expect(result.current.fixerMissions[0].id).toBe('fix-1')
  })

  // ── cache listener updates ─────────────────────────────────────────────────

  it('updates installer and fixer lists when a cache listener fires', async () => {
    mockMissionCache.installers = []
    mockMissionCache.fixes = []
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.installerMissions).toHaveLength(0)

    await act(async () => {
      mockMissionCache.installers = [INSTALLER]
      mockMissionCache.fixes = [FIXER, FIXER2]
      mockMissionCache.listeners.forEach((l) => l())
    })

    expect(result.current.installerMissions).toHaveLength(1)
    expect(result.current.fixerMissions).toHaveLength(2)
  })

  it('updates missionFetchError when cache listener fires', async () => {
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.missionFetchError).toBeNull()

    await act(async () => {
      mockMissionCache.fetchError = 'Connection refused'
      mockMissionCache.listeners.forEach((l) => l())
    })

    expect(result.current.missionFetchError).toBe('Connection refused')
  })

  // ── tokenError ─────────────────────────────────────────────────────────────

  it('tokenError is null initially (no external token state yet)', () => {
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.tokenError).toBeNull()
  })

  // ── searchProgress ─────────────────────────────────────────────────────────

  it('searchProgress.step is "Scanning" when fixes still loading', () => {
    mockMissionCache.fixes = []
    mockMissionCache.fixesDone = false
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.searchProgress.step).toBe('Scanning')
  })

  it('searchProgress.step is "Done" when fixes loaded and fixesDone=true', () => {
    mockMissionCache.fixes = [FIXER]
    mockMissionCache.fixesDone = true
    mockMatchMissionsToCluster.mockReturnValue([MATCH])
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.searchProgress.step).toBe('Done')
  })

  it('searchProgress.found equals the number of fixes when loaded', () => {
    mockMissionCache.fixes = [FIXER, FIXER2]
    mockMissionCache.fixesDone = true
    mockMatchMissionsToCluster.mockReturnValue([MATCH])
    const { result } = renderHook(() => useMissionRecommendations(true, null))
    expect(result.current.searchProgress.found).toBe(2)
  })
})
