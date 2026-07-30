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

import { usePVCDrillDown } from './usePVCDrillDown'

describe('usePVCDrillDown', () => {
  beforeEach(() => {
    mockUseLocalAgent.mockReset()
    mockRunKubectl.mockReset()
    mockCopyToClipboard.mockReset()
  })

  it('returns initial data from props and does not fetch when agent is disconnected', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() =>
      usePVCDrillDown('c1', 'ns1', 'pvc1', { status: 'Bound', capacity: '5Gi', accessModes: ['ReadWriteOnce'] }),
    )
    expect(result.current.agentConnected).toBe(false)
    expect(result.current.status).toBe('Bound')
    expect(result.current.capacity).toBe('5Gi')
    expect(result.current.accessModes).toEqual(['ReadWriteOnce'])
    expect(result.current.isLoading).toBe(false)
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('success path: parses PVC JSON and populates status/spec/labels', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const pvc = {
      status: { phase: 'Bound', capacity: { storage: '10Gi' } },
      spec: {
        accessModes: ['ReadWriteMany'],
        storageClassName: 'fast',
        volumeName: 'pv-1',
        volumeMode: 'Block',
      },
      metadata: {
        labels: { app: 'demo' },
        annotations: { note: 'hi' },
      },
    }
    mockRunKubectl.mockResolvedValueOnce(JSON.stringify(pvc))

    const { result } = renderHook(() => usePVCDrillDown('c1', 'ns1', 'pvc1', {}))

    await waitFor(() => expect(result.current.status).toBe('Bound'))
    expect(result.current.capacity).toBe('10Gi')
    expect(result.current.accessModes).toEqual(['ReadWriteMany'])
    expect(result.current.storageClass).toBe('fast')
    expect(result.current.volumeName).toBe('pv-1')
    expect(result.current.volumeMode).toBe('Block')
    expect(result.current.labels).toEqual({ app: 'demo' })
    expect(result.current.annotations).toEqual({ note: 'hi' })
    expect(mockRunKubectl).toHaveBeenCalledWith(['get', 'pvc', 'pvc1', '-n', 'ns1', '-o', 'json'])
  })

  it('JSON parse error: keeps prop data, clears labels/annotations', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl.mockResolvedValueOnce('not-json')

    const { result } = renderHook(() =>
      usePVCDrillDown('c1', 'ns1', 'pvc1', { status: 'Bound' }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.status).toBe('Bound')
    expect(result.current.labels).toBeNull()
    expect(result.current.annotations).toBeNull()
  })

  it('fetchDescribe and fetchYaml populate their respective outputs', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl.mockResolvedValueOnce(JSON.stringify({})) // initial fetchData
    const { result } = renderHook(() => usePVCDrillDown('c1', 'ns1', 'pvc1', {}))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    mockRunKubectl.mockResolvedValueOnce('describe output')
    await act(async () => {
      await result.current.fetchDescribe()
    })
    expect(result.current.describeOutput).toBe('describe output')
    expect(result.current.describeLoading).toBe(false)

    mockRunKubectl.mockResolvedValueOnce('yaml output')
    await act(async () => {
      await result.current.fetchYaml()
    })
    expect(result.current.yamlOutput).toBe('yaml output')
    expect(result.current.yamlLoading).toBe(false)
  })

  it('handleCopy sets copiedField only when copy succeeds', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    mockCopyToClipboard.mockResolvedValueOnce(true)
    const { result } = renderHook(() => usePVCDrillDown('c1', 'ns1', 'pvc1', {}))

    await act(async () => {
      await result.current.handleCopy('value', 'field1')
    })
    expect(result.current.copiedField).toBe('field1')

    mockCopyToClipboard.mockResolvedValueOnce(false)
    await act(async () => {
      await result.current.handleCopy('value2', 'field2')
    })
    expect(result.current.copiedField).toBe('field1')
  })
})
