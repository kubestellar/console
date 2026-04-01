import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/cardEvents', () => ({
  useCardSubscribe: vi.fn(() => vi.fn(() => vi.fn())),
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: { clusters: [] },
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  STORAGE_KEY_TOKEN: 'kc-auth-token',
  STORAGE_KEY_MISSIONS_ACTIVE: 'kc-missions-active',
  STORAGE_KEY_MISSIONS_HISTORY: 'kc-missions-history',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
  DEPLOY_ABORT_TIMEOUT_MS: 5000,
} })

import { useDeployMissions } from '../useDeployMissions'

describe('useDeployMissions', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('starts with empty missions', () => {
    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toEqual([])
    expect(result.current.activeMissions).toEqual([])
    expect(result.current.completedMissions).toEqual([])
    expect(result.current.hasActive).toBe(false)
  })

  it('provides clearCompleted function', () => {
    const { result } = renderHook(() => useDeployMissions())
    expect(typeof result.current.clearCompleted).toBe('function')
  })

  it('loads from localStorage', () => {
    const missions = [{
      id: 'm1', workload: 'nginx', namespace: 'default',
      sourceCluster: 'prod', targetClusters: ['staging'],
      status: 'orbit', clusterStatuses: [], startedAt: Date.now(),
      completedAt: Date.now(),
    }]
    localStorage.setItem('kubestellar-missions', JSON.stringify(missions))
    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toHaveLength(1)
    expect(result.current.completedMissions).toHaveLength(1)
  })
})
