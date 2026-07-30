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

import { useReplicaSetDrillDown } from './useReplicaSetDrillDown'

describe('useReplicaSetDrillDown', () => {
  beforeEach(() => {
    mockUseLocalAgent.mockReset()
    mockRunKubectl.mockReset()
    mockCopyToClipboard.mockReset()
  })

  it('returns zeroed defaults and does not fetch while agent is disconnected', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useReplicaSetDrillDown('c1', 'ns1', 'rs1'))
    expect(result.current.agentConnected).toBe(false)
    expect(result.current.replicas).toBe(0)
    expect(result.current.readyReplicas).toBe(0)
    expect(result.current.pods).toEqual([])
    expect(result.current.ownerDeployment).toBeNull()
    expect(result.current.labels).toBeNull()
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('populates replicas, owner deployment, labels, and pods on agent connect', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const rs = {
      spec: {
        replicas: 3,
        selector: { matchLabels: { app: 'web', tier: 'frontend' } },
      },
      status: { readyReplicas: 2 },
      metadata: {
        labels: { app: 'web' },
        ownerReferences: [
          { kind: 'ReplicaSet', name: 'other' },
          { kind: 'Deployment', name: 'web-deploy' },
        ],
      },
    }
    const pods = {
      items: [
        {
          metadata: { name: 'web-1' },
          status: {
            phase: 'Running',
            containerStatuses: [{ restartCount: 1 }, { restartCount: 2 }],
          },
        },
        {
          metadata: { name: 'web-2' },
          status: { phase: 'Pending' },
        },
      ],
    }

    // fetchData → rs JSON, then pods JSON. fetchEvents/Describe/Yaml return strings.
    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify(rs))
      .mockResolvedValueOnce(JSON.stringify(pods))
      .mockResolvedValueOnce('events output')
      .mockResolvedValueOnce('describe output')
      .mockResolvedValueOnce('yaml output')

    const { result } = renderHook(() => useReplicaSetDrillDown('c1', 'ns1', 'rs1'))

    await waitFor(() => {
      expect(result.current.replicas).toBe(3)
      expect(result.current.pods.length).toBe(2)
    })

    expect(result.current.readyReplicas).toBe(2)
    expect(result.current.ownerDeployment).toBe('web-deploy')
    expect(result.current.labels).toEqual({ app: 'web' })
    expect(result.current.pods).toEqual([
      { name: 'web-1', status: 'Running', restarts: 3 },
      { name: 'web-2', status: 'Pending', restarts: 0 },
    ])

    const podsCall = mockRunKubectl.mock.calls[1][0] as string[]
    expect(podsCall.slice(0, 5)).toEqual(['get', 'pods', '-n', 'ns1', '-l'])
    // Selector should include both matchLabels entries joined by comma.
    const selector = podsCall[5]
    expect(selector.split(',').sort()).toEqual(['app=web', 'tier=frontend'])

    await waitFor(() => {
      expect(result.current.eventsOutput).toBe('events output')
      expect(result.current.describeOutput).toBe('describe output')
      expect(result.current.yamlOutput).toBe('yaml output')
    })
  })

  it('skips pod lookup when selector has no matchLabels', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const rs = {
      spec: { replicas: 1, selector: {} },
      status: {},
      metadata: {},
    }
    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify(rs))
      .mockResolvedValueOnce('events output')
      .mockResolvedValueOnce('describe output')
      .mockResolvedValueOnce('yaml output')

    const { result } = renderHook(() => useReplicaSetDrillDown('c1', 'ns1', 'rs1'))
    await waitFor(() => expect(result.current.replicas).toBe(1))
    expect(result.current.pods).toEqual([])
    // Only 4 calls: rs get + events + describe + yaml (no pods lookup).
    await waitFor(() => expect(mockRunKubectl).toHaveBeenCalledTimes(4))
  })

  it('handles invalid ReplicaSet JSON without throwing and leaves defaults intact', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce('events output')
      .mockResolvedValueOnce('describe output')
      .mockResolvedValueOnce('yaml output')

    const { result } = renderHook(() => useReplicaSetDrillDown('c1', 'ns1', 'rs1'))
    await waitFor(() => expect(result.current.eventsOutput).toBe('events output'))
    expect(result.current.replicas).toBe(0)
    expect(result.current.labels).toBeNull()
  })

  it('handleCopy invokes clipboard and sets copiedField', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useReplicaSetDrillDown('c1', 'ns1', 'rs1'))
    act(() => {
      result.current.handleCopy('replicas', '3')
    })
    expect(mockCopyToClipboard).toHaveBeenCalledWith('3')
    expect(result.current.copiedField).toBe('replicas')
  })
})
