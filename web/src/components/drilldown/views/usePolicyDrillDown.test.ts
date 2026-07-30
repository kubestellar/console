import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mockUseLocalAgent = vi.fn()
const mockRunKubectl = vi.fn()

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => mockUseLocalAgent(),
}))

vi.mock('../../../hooks/useDrillDownWebSocket', () => ({
  useDrillDownWebSocket: () => ({ runKubectl: mockRunKubectl }),
}))

import { usePolicyDrillDown } from './usePolicyDrillDown'

describe('usePolicyDrillDown', () => {
  beforeEach(() => {
    mockUseLocalAgent.mockReset()
    mockRunKubectl.mockReset()
  })

  it('returns idle initial state and does not fetch when agent is disconnected', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() =>
      usePolicyDrillDown('c1', 'p1', 'kyverno', 'ClusterPolicy'),
    )
    expect(result.current.agentConnected).toBe(false)
    expect(result.current.violations).toBeNull()
    expect(result.current.violationsLoading).toBe(false)
    expect(result.current.policySpec).toBeNull()
    expect(result.current.specLoading).toBe(false)
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('kyverno path: extracts matching failing violations from policy reports and loads spec', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })

    const report = {
      items: [
        {
          results: [
            {
              policy: 'p1',
              result: 'fail',
              message: 'boom',
              timestamp: '2024-01-02T03:04:05Z',
              resources: [{ name: 'r1', kind: 'Pod', namespace: 'ns1' }],
            },
            { policy: 'p1', result: 'pass', resources: [{ name: 'r2', kind: 'Pod' }] },
            { policy: 'other', result: 'fail', resources: [{ name: 'r3', kind: 'Pod' }] },
          ],
        },
      ],
    }
    const spec = { spec: { validationFailureAction: 'enforce', background: true } }

    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify(report))
      .mockResolvedValueOnce(JSON.stringify(spec))

    const { result } = renderHook(() =>
      usePolicyDrillDown('c1', 'p1', 'kyverno', 'ClusterPolicy'),
    )

    await waitFor(() => {
      expect(result.current.violations).not.toBeNull()
      expect(result.current.policySpec).not.toBeNull()
    })

    expect(result.current.violations).toEqual([
      {
        resource: 'r1',
        kind: 'Pod',
        namespace: 'ns1',
        message: 'boom',
        timestamp: '2024-01-02T03:04:05Z',
      },
    ])
    expect(result.current.policySpec).toEqual(spec.spec)
    expect(result.current.violationsLoading).toBe(false)
    expect(result.current.specLoading).toBe(false)
  })

  it('kyverno path: converts numeric-seconds timestamp to ISO string', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const report = {
      items: [
        {
          results: [
            {
              policy: 'p1',
              result: 'fail',
              message: 'm',
              timestamp: { seconds: 1_700_000_000 },
              resources: [{ name: 'r', kind: 'Pod' }],
            },
          ],
        },
      ],
    }
    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify(report))
      .mockResolvedValueOnce(JSON.stringify({ spec: {} }))

    const { result } = renderHook(() =>
      usePolicyDrillDown('c1', 'p1', 'kyverno', 'ClusterPolicy'),
    )
    await waitFor(() => expect(result.current.violations).not.toBeNull())
    const ts = result.current.violations![0].timestamp
    expect(ts).toBe(new Date(1_700_000_000 * 1000).toISOString())
  })

  it('kyverno path: passes namespaced policy resource when namespace is provided', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify({ items: [] }))
      .mockResolvedValueOnce(JSON.stringify({ spec: {} }))

    renderHook(() => usePolicyDrillDown('c1', 'my-pol', 'kyverno', 'Policy', 'ns-a'))
    await waitFor(() => expect(mockRunKubectl).toHaveBeenCalledTimes(2))

    const specCall = mockRunKubectl.mock.calls[1][0] as string[]
    expect(specCall).toEqual(['get', 'policy/my-pol', '-n', 'ns-a', '-o', 'json'])
  })

  it('OPA Gatekeeper path: maps constraint.status.violations to Violation shape', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const constraint = {
      status: {
        violations: [
          { name: 'r1', kind: 'Pod', namespace: 'ns1', message: 'nope' },
          { message: 'partial' },
        ],
      },
      spec: { match: { kinds: [{ kinds: ['Pod'] }] } },
    }
    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify(constraint))
      .mockResolvedValueOnce(JSON.stringify(constraint))

    const { result } = renderHook(() =>
      usePolicyDrillDown('c1', 'k8sallowedrepos', 'gatekeeper', 'K8sAllowedRepos'),
    )
    await waitFor(() => expect(result.current.violations).not.toBeNull())

    expect(result.current.violations).toEqual([
      { resource: 'r1', kind: 'Pod', namespace: 'ns1', message: 'nope' },
      { resource: 'Unknown', kind: 'Unknown', namespace: undefined, message: 'partial' },
    ])
    expect(result.current.policySpec).toEqual(constraint.spec)
    const violCall = mockRunKubectl.mock.calls[0][0] as string[]
    expect(violCall).toEqual(['get', 'k8sallowedrepos', 'k8sallowedrepos', '-o', 'json'])
  })

  it('error paths: violations fetch failure sets empty array, spec failure sets empty object', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl
      .mockRejectedValueOnce(new Error('kubectl blew up'))
      .mockRejectedValueOnce(new Error('kubectl still blew up'))

    const { result } = renderHook(() =>
      usePolicyDrillDown('c1', 'p1', 'kyverno', 'ClusterPolicy'),
    )
    await waitFor(() => {
      expect(result.current.violations).toEqual([])
      expect(result.current.policySpec).toEqual({})
    })
    expect(result.current.violationsLoading).toBe(false)
    expect(result.current.specLoading).toBe(false)
  })
})
