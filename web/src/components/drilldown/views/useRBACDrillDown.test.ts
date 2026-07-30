import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockUseLocalAgent = vi.fn()
const mockRunKubectl = vi.fn()
const mockCopyToClipboard = vi.fn()

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => mockUseLocalAgent(),
}))

vi.mock('../../../hooks/useDrillDownWebSocket', () => ({
  useDrillDownWebSocket: () => ({ runKubectl: mockRunKubectl }),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: (text: string) => mockCopyToClipboard(text),
}))

import { useRBACDrillDown } from './useRBACDrillDown'

describe('useRBACDrillDown', () => {
  beforeEach(() => {
    mockUseLocalAgent.mockReset()
    mockRunKubectl.mockReset()
    mockCopyToClipboard.mockReset()
  })

  it('returns loading initial state and does not fetch when agent is disconnected', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useRBACDrillDown('c1', 'ns1', 'sa1', 'ServiceAccount'))
    expect(result.current.agentConnected).toBe(false)
    expect(result.current.clusterBindings).toEqual([])
    expect(result.current.roleBindings).toEqual([])
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('success path: filters bindings matching a ServiceAccount subject', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const crb = {
      items: [
        {
          metadata: { name: 'crb-1' },
          subjects: [{ kind: 'ServiceAccount', name: 'sa1' }],
          roleRef: { kind: 'ClusterRole', name: 'admin' },
        },
        {
          metadata: { name: 'crb-2' },
          subjects: [{ kind: 'ServiceAccount', name: 'other' }],
          roleRef: { kind: 'ClusterRole', name: 'view' },
        },
      ],
    }
    const rb = {
      items: [
        {
          metadata: { name: 'rb-1', namespace: 'ns1' },
          subjects: [{ kind: 'ServiceAccount', name: 'sa1' }],
          roleRef: { kind: 'Role', name: 'editor' },
        },
      ],
    }
    mockRunKubectl.mockImplementation((args: string[]) => {
      if (args[1] === 'clusterrolebindings') return Promise.resolve(JSON.stringify(crb))
      return Promise.resolve(JSON.stringify(rb))
    })

    const { result } = renderHook(() => useRBACDrillDown('c1', 'ns1', 'sa1', 'ServiceAccount'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.clusterBindings).toEqual([
      { kind: 'ClusterRoleBinding', name: 'crb-1', namespace: undefined, roleName: 'admin', roleKind: 'ClusterRole' },
    ])
    expect(result.current.roleBindings).toEqual([
      { kind: 'RoleBinding', name: 'rb-1', namespace: 'ns1', roleName: 'editor', roleKind: 'Role' },
    ])
    expect(result.current.totalBindings).toBe(2)
    expect(result.current.hiddenBindingCount).toBe(0)
  })

  it('uses --all-namespaces when namespace is undefined', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl.mockResolvedValue(JSON.stringify({ items: [] }))

    renderHook(() => useRBACDrillDown('c1', undefined, 'crole1', 'ClusterRole'))
    await waitFor(() => expect(mockRunKubectl).toHaveBeenCalledTimes(2))

    const rbCall = mockRunKubectl.mock.calls.find(c => (c[0] as string[])[1] === 'rolebindings')?.[0] as string[]
    expect(rbCall).toContain('--all-namespaces')
  })

  it('error path: sets loadError and clears bindings when fetch throws', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl.mockRejectedValue(new Error('kubectl blew up'))

    const { result } = renderHook(() => useRBACDrillDown('c1', 'ns1', 'sa1', 'ServiceAccount'))
    await waitFor(() => expect(result.current.loadError).toBe('kubectl blew up'))
    expect(result.current.clusterBindings).toEqual([])
    expect(result.current.roleBindings).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('handleRefresh clears describe/yaml output and refetches bindings', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl.mockResolvedValue(JSON.stringify({ items: [] }))

    const { result } = renderHook(() => useRBACDrillDown('c1', 'ns1', 'sa1', 'ServiceAccount'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const callsBefore = mockRunKubectl.mock.calls.length
    await act(async () => {
      await result.current.handleRefresh()
    })
    expect(result.current.describeOutput).toBeNull()
    expect(result.current.yamlOutput).toBeNull()
    expect(result.current.refreshing).toBe(false)
    expect(mockRunKubectl.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('handleCopy copies value and sets copiedField', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useRBACDrillDown('c1', 'ns1', 'sa1', 'ServiceAccount'))

    act(() => {
      result.current.handleCopy('field1', 'value1')
    })
    expect(mockCopyToClipboard).toHaveBeenCalledWith('value1')
    expect(result.current.copiedField).toBe('field1')
  })
})
