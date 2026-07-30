/**
 * Unit tests for useLocalClusters.
 *
 * This hook was extracted from LocalClustersSection.tsx in PR #21902.
 * LocalClustersSection.test.tsx already covers it indirectly via component
 * rendering; this file adds focused renderHook coverage of the hook's own
 * contract, with useLocalClusterTools (a large, separately-tested hook)
 * mocked out:
 *
 *   - derived healthyClusters / hasVClusterTool / localClusterTools
 *   - handleCreate's guard against blank tool/name and its success path
 *   - handleDelete's success and failure toast paths
 *   - handleCreateVCluster resetting form fields on 'creating' status
 *
 * Addresses #21906 (coverage gap for hooks extracted in #21902).
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

const showToast = vi.fn()
vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast }),
}))

const createCluster = vi.fn()
const deleteCluster = vi.fn()
const createVCluster = vi.fn()
const deleteVCluster = vi.fn()
const connectVCluster = vi.fn()
const disconnectVCluster = vi.fn()
const checkVClusterOnCluster = vi.fn()
let mockInstalledTools: Array<{ name: string; installed: boolean }> = []

vi.mock('../../../../hooks/useLocalClusterTools', () => ({
  useLocalClusterTools: () => ({
    installedTools: mockInstalledTools,
    createCluster,
    deleteCluster,
    createVCluster,
    deleteVCluster,
    connectVCluster,
    disconnectVCluster,
    checkVClusterOnCluster,
  }),
}))

const startMission = vi.fn()
vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission }),
}))

const checkKeyAndRun = vi.fn((fn: () => void) => fn())
vi.mock('../../../cards/console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false, checkKeyAndRun, goToSettings: vi.fn(), dismissPrompt: vi.fn(),
  }),
}))

let mockDeduplicatedClusters: Array<{ name: string; context?: string; healthy?: boolean }> = []
vi.mock('../../../../hooks/mcp/clusters', () => ({
  useClusters: () => ({ deduplicatedClusters: mockDeduplicatedClusters }),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitLocalClusterCreated: vi.fn(),
}))

import { useLocalClusters } from '../useLocalClusters'

describe('useLocalClusters', () => {
  beforeEach(() => {
    mockInstalledTools = [
      { name: 'kind', installed: true },
      { name: 'vcluster', installed: true },
    ]
    mockDeduplicatedClusters = [
      { name: 'a', context: 'a', healthy: true },
      { name: 'b', context: 'b', healthy: false },
    ]
    showToast.mockClear()
    createCluster.mockReset().mockResolvedValue({ status: 'creating' })
    deleteCluster.mockReset().mockResolvedValue(true)
    createVCluster.mockReset().mockResolvedValue({ status: 'creating' })
    checkKeyAndRun.mockClear()
    startMission.mockClear()
  })

  it('derives healthyClusters, hasVClusterTool, and localClusterTools (excluding vcluster)', () => {
    const { result } = renderHook(() => useLocalClusters())
    expect(result.current.healthyClusters).toEqual([{ name: 'a', context: 'a', healthy: true }])
    expect(result.current.hasVClusterTool).toBe(true)
    expect(result.current.localClusterTools).toEqual([{ name: 'kind', installed: true }])
  })

  it('handleCreate is a no-op when no tool or empty cluster name is selected', async () => {
    const { result } = renderHook(() => useLocalClusters())
    await act(async () => { await result.current.handleCreate() })
    expect(createCluster).not.toHaveBeenCalled()

    act(() => { result.current.setSelectedTool('kind') })
    await act(async () => { await result.current.handleCreate() })
    expect(createCluster).not.toHaveBeenCalled()
  })

  it('handleCreate calls createCluster and clears the name field when creation starts', async () => {
    const { result } = renderHook(() => useLocalClusters())
    act(() => {
      result.current.setSelectedTool('kind')
      result.current.setClusterName('my-cluster')
    })
    await act(async () => { await result.current.handleCreate() })

    expect(createCluster).toHaveBeenCalledWith('kind', 'my-cluster')
    expect(result.current.clusterName).toBe('')
  })

  it('handleDelete shows a success toast when deletion succeeds', async () => {
    const { result } = renderHook(() => useLocalClusters())
    await act(async () => { await result.current.handleDelete('kind', 'my-cluster') })
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('settings.localClusters.deleteSuccess'), 'success')
  })

  it('handleDelete shows an error toast when deletion fails', async () => {
    deleteCluster.mockResolvedValueOnce(false)
    const { result } = renderHook(() => useLocalClusters())
    await act(async () => { await result.current.handleDelete('kind', 'my-cluster') })
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('settings.localClusters.deleteError'), 'error')
  })

  it('handleCreateVCluster resets vclusterName/vclusterNamespace once creation starts', async () => {
    const { result } = renderHook(() => useLocalClusters())
    act(() => { result.current.setVclusterName('my-vc') })
    await act(async () => { await result.current.handleCreateVCluster() })

    expect(createVCluster).toHaveBeenCalledWith('my-vc', 'vcluster')
    expect(result.current.vclusterName).toBe('')
    expect(result.current.vclusterNamespace).toBe('vcluster')
  })

  it('handleInstallVClusterCLI gates the mission start behind the API key check', () => {
    const { result } = renderHook(() => useLocalClusters())
    act(() => { result.current.handleInstallVClusterCLI() })
    expect(checkKeyAndRun).toHaveBeenCalled()
    expect(startMission).toHaveBeenCalledWith(expect.objectContaining({ title: 'Install vCluster CLI' }))
  })
})
