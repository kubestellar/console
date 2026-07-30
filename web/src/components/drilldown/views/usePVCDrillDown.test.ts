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
    mockCopyToClipboard.mockResolvedValue(true)
  })

  it('returns initial data from props and skips fetch when agent is disconnected', () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() =>
      usePVCDrillDown('c1', 'ns1', 'pvc1', {
        status: 'Bound',
        capacity: '10Gi',
        accessModes: ['ReadWriteOnce'],
        storageClass: 'gp2',
        volumeName: 'pv-abc',
      }),
    )
    expect(result.current.agentConnected).toBe(false)
    expect(result.current.status).toBe('Bound')
    expect(result.current.capacity).toBe('10Gi')
    expect(result.current.accessModes).toEqual(['ReadWriteOnce'])
    expect(result.current.storageClass).toBe('gp2')
    expect(result.current.volumeName).toBe('pv-abc')
    expect(result.current.labels).toBeNull()
    expect(result.current.annotations).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(mockRunKubectl).not.toHaveBeenCalled()
  })

  it('populates fields from kubectl JSON on successful fetch', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const pvc = {
      status: { phase: 'Bound', capacity: { storage: '20Gi' } },
      spec: {
        accessModes: ['ReadWriteMany'],
        storageClassName: 'nfs',
        volumeName: 'pv-xyz',
        volumeMode: 'Block',
      },
      metadata: { labels: { app: 'db' }, annotations: { note: 'primary' } },
    }
    mockRunKubectl.mockResolvedValueOnce(JSON.stringify(pvc))

    const { result } = renderHook(() =>
      usePVCDrillDown('c1', 'ns1', 'pvc1', {}),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('Bound')
    })
    expect(result.current.capacity).toBe('20Gi')
    expect(result.current.accessModes).toEqual(['ReadWriteMany'])
    expect(result.current.storageClass).toBe('nfs')
    expect(result.current.volumeName).toBe('pv-xyz')
    expect(result.current.volumeMode).toBe('Block')
    expect(result.current.labels).toEqual({ app: 'db' })
    expect(result.current.annotations).toEqual({ note: 'primary' })
    expect(result.current.isLoading).toBe(false)
    expect(mockRunKubectl).toHaveBeenCalledWith(['get', 'pvc', 'pvc1', '-n', 'ns1', '-o', 'json'])
  })

  it('falls back to requested storage when status capacity is absent, defaults volumeMode to Filesystem', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    const pvc = {
      status: { phase: 'Pending' },
      spec: { resources: { requests: { storage: '5Gi' } } },
      metadata: {},
    }
    mockRunKubectl.mockResolvedValueOnce(JSON.stringify(pvc))

    const { result } = renderHook(() => usePVCDrillDown('c1', 'ns1', 'pvc1', {}))
    await waitFor(() => expect(result.current.status).toBe('Pending'))
    expect(result.current.capacity).toBe('5Gi')
    expect(result.current.volumeMode).toBe('Filesystem')
  })

  it('handles invalid JSON output without throwing and clears labels/annotations', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl.mockResolvedValueOnce('not-json')

    const { result } = renderHook(() =>
      usePVCDrillDown('c1', 'ns1', 'pvc1', { status: 'Bound' }),
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.labels).toBeNull()
    expect(result.current.annotations).toBeNull()
    expect(result.current.status).toBe('Bound')
  })

  it('fetchDescribe issues describe command and captures output', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify({ status: {}, spec: {}, metadata: {} }))
      .mockResolvedValueOnce('Name: pvc1\nStatus: Bound')

    const { result } = renderHook(() => usePVCDrillDown('c1', 'ns1', 'pvc1', {}))
    await waitFor(() => expect(mockRunKubectl).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.fetchDescribe()
    })

    expect(mockRunKubectl).toHaveBeenLastCalledWith(['describe', 'pvc', 'pvc1', '-n', 'ns1'])
    expect(result.current.describeOutput).toBe('Name: pvc1\nStatus: Bound')
    expect(result.current.describeLoading).toBe(false)
  })

  it('fetchYaml uses -o yaml and sets fallback message on empty output', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: true })
    mockRunKubectl
      .mockResolvedValueOnce(JSON.stringify({ status: {}, spec: {}, metadata: {} }))
      .mockResolvedValueOnce('')

    const { result } = renderHook(() => usePVCDrillDown('c1', 'ns1', 'pvc1', {}))
    await waitFor(() => expect(mockRunKubectl).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.fetchYaml()
    })

    expect(mockRunKubectl).toHaveBeenLastCalledWith(['get', 'pvc', 'pvc1', '-n', 'ns1', '-o', 'yaml'])
    expect(result.current.yamlOutput).toBe('No output received')
  })

  it('handleCopy sets copiedField only when clipboard write succeeds', async () => {
    mockUseLocalAgent.mockReturnValue({ isConnected: false })
    const { result } = renderHook(() => usePVCDrillDown('c1', 'ns1', 'pvc1', {}))

    mockCopyToClipboard.mockResolvedValueOnce(true)
    await act(async () => {
      await result.current.handleCopy('hello', 'name')
    })
    expect(mockCopyToClipboard).toHaveBeenCalledWith('hello')
    expect(result.current.copiedField).toBe('name')

    mockCopyToClipboard.mockResolvedValueOnce(false)
    await act(async () => {
      await result.current.handleCopy('nope', 'other')
    })
    expect(result.current.copiedField).toBe('name')
  })
})
