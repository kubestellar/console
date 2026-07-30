import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockUseLocalAgent = vi.fn()
const mockRunKubectl = vi.fn()

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => mockUseLocalAgent(),
}))

vi.mock('../../../hooks/useDrillDownWebSocket', () => ({
  useDrillDownWebSocket: () => ({ runKubectl: mockRunKubectl }),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

import { useReplicaSetDrillDown } from './useReplicaSetDrillDown'

describe('useReplicaSetDrillDown', () => {
  beforeEach(() => {
    mockUseLocalAgent.mockReset()
    mockRunKubectl.mockReset()
  })

  it('returns idle initial state and does not fetch when agent is disconnected', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useReplicaSetDrillDown('c1', 'ns1', 'rs1'))
    expect(result.current.agentConnected).toBe(false)
    expect(result.current.replicas).toBe(0)
    expect(result.current.readyReplicas).toBe(0)
    expect(result.current.pods).toEqual([])
    expect(result.current.ownerDeployment).toBeNull()
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('success path: populates replicas, owner deployment, labels, pods, and events', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const rs = {
      spec: { replicas: 3, selector: { matchLabels: { app: 'demo' } } },
      status: { readyReplicas: 2 },
      metadata: {
        labels: { app: 'demo' },
        ownerReferences: [{ kind: 'Deployment', name: 'demo-deploy' }],
      },
    }
    const pods = {
      items: [
        { metadata: { name: 'pod-1' }, status: { phase: 'Running', containerStatuses: [{ restartCount: 1 }, { restartCount: 2 }] } },
        { metadata: { name: 'pod-2' }, status: { phase: 'Pending' } },
      ],
    }
    mockRunKubectl.mockImplementation((args: string[]) => {
      if (args[0] === 'get' && args[1] === 'replicaset' && args[args.length - 1] === 'json') {
        return Promise.resolve(JSON.stringify(rs))
      }
      if (args[0] === 'get' && args[1] === 'pods') {
        return Promise.resolve(JSON.stringify(pods))
      }
      if (args[0] === 'get' && args[1] === 'events') {
        return Promise.resolve('event output')
      }
      if (args[0] === 'describe') {
        return Promise.resolve('describe output')
      }
      if (args[0] === 'get' && args[1] === 'replicaset' && args[args.length - 1] === 'yaml') {
        return Promise.resolve('yaml output')
      }
      return Promise.resolve('')
    })

    const { result } = renderHook(() => useReplicaSetDrillDown('c1', 'ns1', 'rs1'))

    await waitFor(() => expect(result.current.replicas).toBe(3))
    expect(result.current.readyReplicas).toBe(2)
    expect(result.current.ownerDeployment).toBe('demo-deploy')
    expect(result.current.labels).toEqual({ app: 'demo' })
    expect(result.current.pods).toEqual([
      { name: 'pod-1', status: 'Running', restarts: 3 },
      { name: 'pod-2', status: 'Pending', restarts: 0 },
    ])

    await waitFor(() => expect(result.current.eventsOutput).toBe('event output'))
    await waitFor(() => expect(result.current.describeOutput).toBe('describe output'))
    await waitFor(() => expect(result.current.yamlOutput).toBe('yaml output'))
  })

  it('JSON parse error on ReplicaSet output leaves defaults untouched', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl.mockImplementation((args: string[]) => {
      if (args[0] === 'get' && args[1] === 'replicaset' && args[args.length - 1] === 'json') {
        return Promise.resolve('not-json')
      }
      if (args[0] === 'get' && args[1] === 'events') {
        return Promise.resolve('event output')
      }
      if (args[0] === 'describe') {
        return Promise.resolve('describe output')
      }
      return Promise.resolve('yaml output')
    })

    const { result } = renderHook(() => useReplicaSetDrillDown('c1', 'ns1', 'rs1'))

    await waitFor(() => expect(result.current.eventsOutput).toBe('event output'))
    expect(result.current.replicas).toBe(0)
    expect(result.current.pods).toEqual([])
  })

  it('handleCopy sets and clears copiedField via timeout', async () => {
    vi.useFakeTimers()
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useReplicaSetDrillDown('c1', 'ns1', 'rs1'))

    act(() => {
      result.current.handleCopy('field1', 'value')
    })
    expect(result.current.copiedField).toBe('field1')

    act(() => {
      vi.runAllTimers()
    })
    expect(result.current.copiedField).toBeNull()
    vi.useRealTimers()
  })
})
