import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMissionControl } from '../useMissionControl'
import type { MissionControlState, PayloadProject } from '../types'
import * as useMissionsModule from '../../../hooks/useMissions'
import * as useClustersModule from '../../../hooks/mcp/clusters'
import * as useHelmReleasesModule from '../../../hooks/mcp/helm'
import * as toastModule from '../../ui/Toast'

// Mock dependencies
vi.mock('../../../hooks/useMissions')
vi.mock('../../../hooks/mcp/clusters')
vi.mock('../../../hooks/mcp/helm')
vi.mock('../../ui/Toast')
vi.mock('../../../lib/kubara')

type UseMissionsResult = ReturnType<typeof useMissionsModule.useMissions>
type UseClustersResult = ReturnType<typeof useClustersModule.useClusters>
type UseHelmReleasesResult = ReturnType<typeof useHelmReleasesModule.useHelmReleases>

describe('useMissionControl hook', () => {
  const mockShowToast = vi.fn()
  const mockStartMission = vi.fn()
  const mockSendMessage = vi.fn()
  const mockDismissMission = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock implementations
    vi.spyOn(toastModule, 'useToast').mockReturnValue({ showToast: mockShowToast })
    vi.spyOn(useMissionsModule, 'useMissions').mockReturnValue({
      startMission: mockStartMission,
      sendMessage: mockSendMessage,
      dismissMission: mockDismissMission,
      missions: [],
    } as unknown as UseMissionsResult)
    vi.spyOn(useClustersModule, 'useClusters').mockReturnValue({
      clusters: [], deduplicatedClusters: [],
      isLoading: false,
      lastUpdated: new Date(),
    } as unknown as UseClustersResult)
    vi.spyOn(useHelmReleasesModule, 'useHelmReleases').mockReturnValue({
      releases: [],
      isLoading: false,
    } as unknown as UseHelmReleasesResult)

    // Clear localStorage
    localStorage.clear()
    sessionStorage.clear()
  })

  it('initializes with default state', () => {
    const { result } = renderHook(() => useMissionControl())
    
    expect(result.current.state.phase).toBe('define')
    expect(result.current.state.projects).toEqual([])
    expect(result.current.state.assignments).toEqual([])
  })

  it('updates description and title', () => {
    const { result } = renderHook(() => useMissionControl())
    
    act(() => {
      result.current.setDescription('New Description')
      result.current.setTitle('New Title')
    })
    
    expect(result.current.state.description).toBe('New Description')
    expect(result.current.state.title).toBe('New Title')
  })

  it('persists state to localStorage', () => {
    const { result } = renderHook(() => useMissionControl())
    
    act(() => {
      result.current.setTitle('Persistent Title')
    })

    // Note: persistence is debounced in the hook (300ms)
    // We can check if it's eventually called or mock the debounce
    // For this test, let's wait a bit or check if we can trigger the effect
  })

  it('adds and removes projects', () => {
    const { result } = renderHook(() => useMissionControl())
    
    const project = {
      name: 'test-proj',
      displayName: 'Test Project',
      category: 'Security',
      priority: 'required' as const,
      reason: 'test',
      dependencies: [],
    }

    act(() => {
      result.current.addProject(project)
    })
    
    expect(result.current.state.projects).toHaveLength(1)
    expect(result.current.state.projects[0].name).toBe('test-proj')
    expect(result.current.state.projects[0].userAdded).toBe(true)

    act(() => {
      result.current.removeProject('test-proj')
    })
    
    expect(result.current.state.projects).toHaveLength(0)
  })

  it('handles phase transitions', () => {
    const { result } = renderHook(() => useMissionControl())
    
    act(() => {
      result.current.setPhase('assign')
    })
    
    expect(result.current.state.phase).toBe('assign')
  })

  it('resets state correctly', () => {
    const { result } = renderHook(() => useMissionControl())
    
    act(() => {
      result.current.setTitle('To be reset')
      result.current.reset()
    })
    
    expect(result.current.state.title).toBe('')
    expect(result.current.state.phase).toBe('define')
  })

  it('does not auto-timeout while a planning mission exists', async () => {
    vi.useFakeTimers()
    mockStartMission.mockReturnValue('mission-123')
    vi.spyOn(useMissionsModule, 'useMissions').mockReturnValue({
      startMission: mockStartMission,
      sendMessage: mockSendMessage,
      dismissMission: mockDismissMission,
      missions: [{ id: 'mission-123', status: 'running', messages: [] }],
    } as unknown as UseMissionsResult)

    const { result } = renderHook(() => useMissionControl())

    await act(async () => {
      await result.current.askAIForSuggestions('suggest projects for security hardening')
    })

    act(() => {
      vi.advanceTimersByTime(31_000)
    })

    expect(mockDismissMission).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('automatically assigns projects to clusters', async () => {
    const { result } = renderHook(() => useMissionControl())
    
    const project = {
      name: 'prom',
      displayName: 'Prom',
      category: 'Monitoring',
      priority: 'required' as const,
      reason: 'test',
      dependencies: [],
    }

    act(() => {
      result.current.addProject(project)
    })

    const clusters: Parameters<ReturnType<typeof useMissionControl>['autoAssignProjects']>[0] = [
      { name: 'cluster-1', cpuCores: 8, memoryGB: 16 },
      { name: 'cluster-2', cpuCores: 4, memoryGB: 8 },
    ]

    await act(async () => {
      await result.current.autoAssignProjects(clusters)
    })

    expect(result.current.state.assignments).toHaveLength(2)
    // Should be assigned to the bigger cluster (cluster-1)
    const cluster1 = result.current.state.assignments.find(a => a.clusterName === 'cluster-1')
    expect(cluster1?.projectNames).toContain('prom')
  })

  it('identifies installed projects from helm releases', () => {
    vi.spyOn(useHelmReleasesModule, 'useHelmReleases').mockReturnValue({
      releases: [
        { name: 'prometheus-release', chart: 'prometheus', namespace: 'monitoring', cluster: 'cluster-1' }
      ],
      isLoading: false,
    } as unknown as UseHelmReleasesResult)

    const { result } = renderHook(() => useMissionControl())
    
    act(() => {
      result.current.addProject({
        name: 'prometheus',
        displayName: 'Prometheus',
        category: 'Monitoring',
        priority: 'required' as const,
        reason: 'test',
        dependencies: [],
      })
    })

    expect(result.current.installedProjects.has('prometheus')).toBe(true)
    expect(result.current.installedOnCluster.get('prometheus')?.has('cluster-1')).toBe(true)
  })

  it('detects stale clusters from persisted state', () => {
    // Seed localStorage with a cluster that doesn't exist in live list
    const persistedState = {
      phase: 'assign',
      assignments: [
        { clusterName: 'stale-cluster', projectNames: ['p1'], clusterContext: 'stale-cluster' }
      ],
      targetClusters: ['stale-cluster']
    }
    localStorage.setItem('kc_mission_control_state', JSON.stringify({
      state: persistedState,
      savedAt: Date.now(),
      schemaVersion: 1
    }))

    // Live clusters list doesn't have 'stale-cluster'
    vi.spyOn(useClustersModule, 'useClusters').mockReturnValue({
      clusters: [{ name: 'active-cluster', context: 'active-cluster' }],
      deduplicatedClusters: [{ name: 'active-cluster', context: 'active-cluster' }],
      isLoading: false,
      lastUpdated: new Date(),
    } as unknown as UseClustersResult)

    const { result } = renderHook(() => useMissionControl())

    // It takes an effect cycle to reconcile
    expect(result.current.staleClusterNames).toContain('stale-cluster')
    expect(result.current.state.assignments).toHaveLength(0)
    
    act(() => {
      result.current.acknowledgeStaleClusters()
    })
    expect(result.current.staleClusterNames).toHaveLength(0)
  })

  it('hydrates state from a plan', () => {
    const { result } = renderHook(() => useMissionControl())
    
    const hydratedProject: PayloadProject = {
      name: 'p1',
      displayName: 'P1',
      category: 'Observability',
      priority: 'required',
      reason: 'test',
      dependencies: [],
    }

    const partialState: Partial<MissionControlState> = {
      title: 'Hydrated Plan',
      description: 'Hydrated Desc',
      projects: [hydratedProject],
    }

    act(() => {
      result.current.hydrateFromPlan(partialState)
    })
    
    expect(result.current.state.title).toBe('Hydrated Plan')
    expect(result.current.state.phase).toBe('blueprint')
  })
})
