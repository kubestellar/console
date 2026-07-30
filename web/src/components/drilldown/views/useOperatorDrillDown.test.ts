/**
 * renderHook unit tests for useOperatorDrillDown (follow-up for #21968).
 *
 * Covers the data-loading hook extracted by PR #21966 for OperatorDrillDown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const agentState = { isConnected: true }
const mockRunKubectl = vi.fn()

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: agentState.isConnected }),
}))

vi.mock('../../../hooks/useDrillDownWebSocket', () => ({
  useDrillDownWebSocket: () => ({ runKubectl: mockRunKubectl }),
}))

import { useOperatorDrillDown } from './useOperatorDrillDown'

const CSV_NAME = 'cert-manager.v1.14.0'
const OPERATOR_NAME = 'cert-manager'
const NAMESPACE = 'operators'
const OPERATOR_PHASE = 'Succeeded'

function isGet(args: string[], resource: string): boolean {
  return args[0] === 'get' && args[1] === resource
}

beforeEach(() => {
  vi.clearAllMocks()
  agentState.isConnected = true
})

describe('useOperatorDrillDown', () => {
  it('returns null state and does not fetch when agent is disconnected', async () => {
    agentState.isConnected = false

    const { result } = renderHook(() =>
      useOperatorDrillDown(
        'cluster-a',
        NAMESPACE,
        OPERATOR_NAME,
        CSV_NAME,
        OPERATOR_PHASE,
        undefined,
      ),
    )

    expect(result.current.csvInfo).toBeNull()
    expect(result.current.operatorCRDs).toBeNull()
    expect(result.current.csvLoading).toBe(false)
    expect(result.current.crdsLoading).toBe(false)

    await Promise.resolve()
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('populates csvInfo and operatorCRDs from ClusterServiceVersion JSON', async () => {
    const csvPayload = JSON.stringify({
      metadata: { name: CSV_NAME },
      spec: {
        displayName: 'Cert Manager',
        version: '1.14.0',
        description: 'Automatic TLS certificates',
        provider: { name: 'Jetstack' },
        maturity: 'stable',
        maintainers: [{ name: 'jetstack', email: 'ops@jetstack.io' }],
        links: [{ name: 'homepage', url: 'https://cert-manager.io' }],
        installModes: [{ type: 'OwnNamespace', supported: true }],
        customresourcedefinitions: {
          owned: [
            {
              name: 'certificates.cert-manager.io',
              kind: 'Certificate',
              version: 'v1',
              description: 'A TLS certificate',
            },
            {
              name: 'issuers.cert-manager.io',
              kind: 'Issuer',
              version: 'v1',
              description: 'A cert issuer',
            },
          ],
        },
      },
      status: { phase: 'Succeeded' },
    })

    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (isGet(args, 'clusterserviceversion')) return csvPayload
      if (isGet(args, 'subscription')) return 'kind: Subscription\n'
      return null
    })

    const { result } = renderHook(() =>
      useOperatorDrillDown(
        'cluster-a',
        NAMESPACE,
        OPERATOR_NAME,
        CSV_NAME,
        OPERATOR_PHASE,
        'cert-manager-sub',
      ),
    )

    await waitFor(() => {
      expect(result.current.csvInfo).not.toBeNull()
      expect(result.current.operatorCRDs).not.toBeNull()
    })

    expect(result.current.csvInfo).toMatchObject({
      name: CSV_NAME,
      displayName: 'Cert Manager',
      version: '1.14.0',
      phase: 'Succeeded',
      provider: 'Jetstack',
    })
    expect(result.current.operatorCRDs).toEqual([
      {
        name: 'certificates.cert-manager.io',
        kind: 'Certificate',
        version: 'v1',
        description: 'A TLS certificate',
      },
      {
        name: 'issuers.cert-manager.io',
        kind: 'Issuer',
        version: 'v1',
        description: 'A cert issuer',
      },
    ])
    expect(result.current.csvLoading).toBe(false)
    expect(result.current.crdsLoading).toBe(false)
  })

  it('falls back to defaults when the CSV payload is not valid JSON', async () => {
    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (isGet(args, 'clusterserviceversion')) return 'not-json'
      return null
    })

    const { result } = renderHook(() =>
      useOperatorDrillDown(
        'cluster-a',
        NAMESPACE,
        OPERATOR_NAME,
        CSV_NAME,
        OPERATOR_PHASE,
        undefined,
      ),
    )

    await waitFor(() => {
      expect(result.current.csvInfo).not.toBeNull()
    })
    expect(result.current.csvInfo).toEqual({
      name: CSV_NAME,
      displayName: OPERATOR_NAME,
      version: 'Unknown',
      phase: OPERATOR_PHASE,
    })
    expect(result.current.operatorCRDs).toEqual([])
  })

  it('returns default csvInfo when runKubectl throws', async () => {
    mockRunKubectl.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() =>
      useOperatorDrillDown(
        'cluster-a',
        NAMESPACE,
        OPERATOR_NAME,
        undefined,
        OPERATOR_PHASE,
        undefined,
      ),
    )

    await waitFor(() => {
      expect(result.current.csvInfo).not.toBeNull()
    })
    expect(result.current.csvInfo).toEqual({
      name: OPERATOR_NAME,
      displayName: OPERATOR_NAME,
      version: 'Unknown',
      phase: OPERATOR_PHASE,
    })
    expect(result.current.operatorCRDs).toEqual([])
  })
})
