/**
 * renderHook unit tests for useDriftDrillDown (follow-up for #21968).
 *
 * Covers the data-loading hook extracted by PR #21966 in isolation from
 * DriftDrillDown.tsx / DriftDrillDown.parts.tsx — the DriftDrillDown
 * container test only exercises this hook implicitly through RTL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const agentState = { isConnected: true }
const mockRunKubectl = vi.fn()

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: agentState.isConnected }),
}))

vi.mock('../../../hooks/useDrillDownWebSocket', () => ({
  useDrillDownWebSocket: () => ({ runKubectl: mockRunKubectl }),
}))

import { useDriftDrillDown } from '../useDriftDrillDown'

const KUSTOMIZATION = 'kustomization'
const ARGO_APPS = ['applications', 'argoproj.io'].join('.')

function isGet(args: string[], resource: string): boolean {
  return args[0] === 'get' && args[1] === resource
}

beforeEach(() => {
  vi.clearAllMocks()
  agentState.isConnected = true
})

describe('useDriftDrillDown', () => {
  it('returns empty initial state and does not fetch when agent is disconnected', async () => {
    agentState.isConnected = false
    mockRunKubectl.mockResolvedValue(null)

    const { result } = renderHook(() => useDriftDrillDown('cluster-a', 'argocd'))

    expect(result.current.changes).toBeNull()
    expect(result.current.changesLoading).toBe(false)
    expect(result.current.changesError).toBeNull()
    expect(result.current.selectedChange).toBeNull()

    // Give any (unexpected) async effects a chance to run.
    await Promise.resolve()
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('populates changes from Flux Kustomization drift annotations', async () => {
    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (isGet(args, KUSTOMIZATION)) {
        return JSON.stringify({
          items: [
            {
              metadata: {
                name: 'app-of-apps',
                namespace: 'flux-system',
                annotations: {
                  'kustomize.toolkit.fluxcd.io/driftDetection': 'enabled',
                },
              },
              status: {
                lastAppliedRevision: 'rev-1',
                lastHandledReconcileAt: 'rev-2',
              },
            },
          ],
        })
      }
      return null
    })

    const { result } = renderHook(() =>
      useDriftDrillDown('cluster-a', 'flux-system'),
    )

    await waitFor(() => {
      expect(result.current.changes).not.toBeNull()
    })

    expect(result.current.changes).toEqual([
      {
        kind: 'Kustomization',
        name: 'app-of-apps',
        namespace: 'flux-system',
        changeType: 'modified',
      },
    ])
    expect(result.current.changesLoading).toBe(false)
    expect(result.current.changesError).toBeNull()
  })

  it('falls back to ArgoCD Applications when no Flux drift is present', async () => {
    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (isGet(args, KUSTOMIZATION)) {
        return JSON.stringify({ items: [] })
      }
      if (isGet(args, ARGO_APPS)) {
        return JSON.stringify({
          items: [
            {
              status: {
                sync: { status: 'OutOfSync' },
                resources: [
                  {
                    kind: 'Deployment',
                    name: 'guestbook-ui',
                    namespace: 'default',
                    status: 'OutOfSync',
                  },
                  {
                    kind: 'Service',
                    name: 'guestbook',
                    namespace: 'default',
                    status: 'Synced',
                  },
                ],
              },
            },
          ],
        })
      }
      return null
    })

    const { result } = renderHook(() =>
      useDriftDrillDown('cluster-a', 'flux-system'),
    )

    await waitFor(() => {
      expect(result.current.changes?.length).toBe(1)
    })

    expect(result.current.changes?.[0]).toMatchObject({
      kind: 'Deployment',
      name: 'guestbook-ui',
      changeType: 'modified',
    })
  })

  it('surfaces a parse error when the Flux Kustomization payload is invalid JSON', async () => {
    mockRunKubectl.mockImplementation(async (args: string[]) => {
      if (isGet(args, KUSTOMIZATION)) return 'not-json'
      return null
    })

    const { result } = renderHook(() =>
      useDriftDrillDown('cluster-a', 'flux-system'),
    )

    await waitFor(() => {
      expect(result.current.changesError).toBe('Failed to parse drift data')
    })
    expect(result.current.changes).toEqual([])
    expect(result.current.changesLoading).toBe(false)
  })

  it('records an error when runKubectl throws', async () => {
    mockRunKubectl.mockRejectedValue(new Error('agent disconnected'))

    const { result } = renderHook(() =>
      useDriftDrillDown('cluster-a', 'flux-system'),
    )

    await waitFor(() => {
      expect(result.current.changesError).toBe('agent disconnected')
    })
    expect(result.current.changes).toEqual([])
  })

  it('setSelectedChange updates the selected change', async () => {
    agentState.isConnected = false
    mockRunKubectl.mockResolvedValue(null)

    const { result } = renderHook(() => useDriftDrillDown('cluster-a', undefined))

    const change = {
      kind: 'Deployment',
      name: 'guestbook-ui',
      namespace: 'default',
      changeType: 'modified' as const,
    }
    act(() => {
      result.current.setSelectedChange(change)
    })
    expect(result.current.selectedChange).toEqual(change)

    act(() => {
      result.current.setSelectedChange(null)
    })
    expect(result.current.selectedChange).toBeNull()
  })
})
