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

import { useCRDDrillDown } from './useCRDDrillDown'

describe('useCRDDrillDown', () => {
  beforeEach(() => {
    mockUseLocalAgent.mockReset()
    mockRunKubectl.mockReset()
  })

  it('returns null-defaults, isEstablished=true, and skips fetch while disconnected', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => useCRDDrillDown('c1', 'widgets.example.com'))
    expect(result.current.agentConnected).toBe(false)
    expect(result.current.versions).toBeNull()
    expect(result.current.instances).toBeNull()
    expect(result.current.conditions).toBeNull()
    expect(result.current.schema).toBeNull()
    expect(result.current.versionsError).toBeNull()
    expect(result.current.instancesError).toBeNull()
    // No conditions loaded yet — default should be established (do not gate the UI).
    expect(result.current.isEstablished).toBe(true)
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('populates versions, conditions, schema, and instances from kubectl output', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })

    const openAPI = { type: 'object', properties: { spec: {} } }
    const crd = {
      spec: {
        versions: [
          { name: 'v1alpha1', served: false, storage: false, deprecated: true, deprecationWarning: 'use v1' },
          { name: 'v1', served: true, storage: true, schema: { openAPIV3Schema: openAPI } },
        ],
      },
      status: {
        conditions: [
          { type: 'Established', status: 'True', reason: 'InitialNamesAccepted', message: 'ok', lastTransitionTime: 't1' },
          { type: 'NamesAccepted', status: 'True' },
        ],
      },
    }
    const list = {
      items: [
        { metadata: { name: 'w1', namespace: 'ns1', creationTimestamp: 't1' } },
        { metadata: { name: 'w2' } },
      ],
    }

    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify(crd))
      .mockResolvedValueOnce(JSON.stringify(list))

    const { result } = renderHook(() => useCRDDrillDown('c1', 'widgets.example.com'))

    await waitFor(() => {
      expect(result.current.versions).not.toBeNull()
      expect(result.current.instances).not.toBeNull()
    })

    expect(result.current.versions).toEqual([
      { name: 'v1alpha1', served: false, storage: false, deprecated: true, deprecationWarning: 'use v1' },
      { name: 'v1', served: true, storage: true, deprecated: undefined, deprecationWarning: undefined },
    ])
    expect(result.current.conditions).toEqual([
      { type: 'Established', status: 'True', reason: 'InitialNamesAccepted', message: 'ok', lastTransitionTime: 't1' },
      { type: 'NamesAccepted', status: 'True', reason: undefined, message: undefined, lastTransitionTime: undefined },
    ])
    expect(result.current.schema).toEqual(openAPI)
    expect(result.current.isEstablished).toBe(true)
    expect(result.current.instances).toEqual([
      { name: 'w1', namespace: 'ns1', creationTimestamp: 't1' },
      { name: 'w2', namespace: undefined, creationTimestamp: undefined },
    ])
    expect(result.current.versionsLoading).toBe(false)
    expect(result.current.instancesLoading).toBe(false)

    // Instances lookup should use the plural (piece before the first dot).
    const instancesCall = mockRunKubectl.mock.calls[1][0] as string[]
    expect(instancesCall).toEqual(['get', 'widgets', '-A', '-o', 'json'])
  })

  it('caps instances at 50 items (MAX_INSTANCES)', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const items = Array.from({ length: 120 }, (_, i) => ({
      metadata: { name: `item-${i}`, namespace: 'ns' },
    }))
    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify({ spec: { versions: [] }, status: { conditions: [] } }))
      .mockResolvedValueOnce(JSON.stringify({ items }))

    const { result } = renderHook(() => useCRDDrillDown('c1', 'things.example.com'))
    await waitFor(() => expect(result.current.instances).not.toBeNull())
    expect(result.current.instances).toHaveLength(50)
    expect(result.current.instances![0].name).toBe('item-0')
    expect(result.current.instances![49].name).toBe('item-49')
  })

  it('isEstablished is false when Established condition status is not True', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const crd = {
      spec: { versions: [{ name: 'v1', served: true, storage: true }] },
      status: { conditions: [{ type: 'Established', status: 'False' }] },
    }
    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify(crd))
      .mockResolvedValueOnce(JSON.stringify({ items: [] }))

    const { result } = renderHook(() => useCRDDrillDown('c1', 'things.example.com'))
    await waitFor(() => expect(result.current.conditions).not.toBeNull())
    expect(result.current.isEstablished).toBe(false)
  })

  it('sets versionsError and empty arrays on invalid CRD JSON', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce(JSON.stringify({ items: [] }))

    const { result } = renderHook(() => useCRDDrillDown('c1', 'things.example.com'))
    await waitFor(() => expect(result.current.versionsError).toBe('Failed to parse CRD data'))
    expect(result.current.versions).toEqual([])
    expect(result.current.conditions).toEqual([])
    expect(result.current.versionsLoading).toBe(false)
  })

  it('sets instancesError on invalid instances JSON', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify({ spec: { versions: [] }, status: { conditions: [] } }))
      .mockResolvedValueOnce('garbage')

    const { result } = renderHook(() => useCRDDrillDown('c1', 'things.example.com'))
    await waitFor(() => expect(result.current.instancesError).toBe('Failed to parse instances data'))
    expect(result.current.instances).toEqual([])
    expect(result.current.instancesLoading).toBe(false)
  })

  it('surfaces thrown error messages from runKubectl for both fetches', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl
      .mockRejectedValueOnce(new Error('boom-crd'))
      .mockRejectedValueOnce(new Error('boom-list'))

    const { result } = renderHook(() => useCRDDrillDown('c1', 'things.example.com'))
    await waitFor(() => {
      expect(result.current.versionsError).toBe('boom-crd')
      expect(result.current.instancesError).toBe('boom-list')
    })
    expect(result.current.versions).toEqual([])
    expect(result.current.conditions).toEqual([])
    expect(result.current.instances).toEqual([])
  })

  it('fetchSchema loads the served-version schema when none was captured initially', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    // Initial CRD fetch has NO schema on served version.
    const crdNoSchema = {
      spec: { versions: [{ name: 'v1', served: true, storage: true }] },
      status: { conditions: [] },
    }
    // Second CRD fetch (via fetchSchema) provides the schema.
    const openAPI = { type: 'object', properties: { spec: {} } }
    const crdWithSchema = {
      spec: {
        versions: [
          { name: 'v1', served: true, storage: true, schema: { openAPIV3Schema: openAPI } },
        ],
      },
    }
    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify(crdNoSchema))
      .mockResolvedValueOnce(JSON.stringify({ items: [] }))
      .mockResolvedValueOnce(JSON.stringify(crdWithSchema))

    const { result } = renderHook(() => useCRDDrillDown('c1', 'things.example.com'))
    await waitFor(() => expect(result.current.versions).not.toBeNull())
    expect(result.current.schema).toBeNull()

    await act(async () => {
      await result.current.fetchSchema()
    })
    expect(result.current.schema).toEqual(openAPI)
    expect(result.current.schemaLoading).toBe(false)

    // fetchSchema should be a no-op after the schema is already loaded.
    const callsBefore = mockRunKubectl.mock.calls.length
    await act(async () => {
      await result.current.fetchSchema()
    })
    expect(mockRunKubectl.mock.calls.length).toBe(callsBefore)
  })
})
