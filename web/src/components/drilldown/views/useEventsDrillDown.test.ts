import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockGetDemoMode = vi.fn()
const mockAgentFetch = vi.fn()
const mockCopyToClipboard = vi.fn()

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => mockGetDemoMode(),
}))

vi.mock('../../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: (text: string) => mockCopyToClipboard(text),
}))

import { useEventsDrillDown } from './useEventsDrillDown'

describe('useEventsDrillDown', () => {
  beforeEach(() => {
    mockGetDemoMode.mockReset()
    mockAgentFetch.mockReset()
    mockCopyToClipboard.mockReset()
    mockGetDemoMode.mockReturnValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips fetching and clears loading state in demo mode', async () => {
    mockGetDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useEventsDrillDown('c1', 'ns1', undefined))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockAgentFetch).not.toHaveBeenCalled()
    expect(result.current.events).toEqual([])
  })

  it('success path: fetches events and populates state', async () => {
    const events = [{ type: 'Warning', reason: 'Failed', message: 'boom', object: 'pod/x', namespace: 'ns1', cluster: 'c1', count: 1 }]
    mockAgentFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ events }) })

    const { result } = renderHook(() => useEventsDrillDown('c1', 'ns1', undefined))

    await waitFor(() => expect(result.current.events).toEqual(events))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()

    const [url] = mockAgentFetch.mock.calls[0] as [string]
    expect(url).toContain('namespace=ns1')
  })

  it('uses default namespace when objectName is set but namespace is not (node events)', async () => {
    mockAgentFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ events: [] }) })
    renderHook(() => useEventsDrillDown('c1', undefined, 'node-1'))
    await waitFor(() => expect(mockAgentFetch).toHaveBeenCalledTimes(1))
    const [url] = mockAgentFetch.mock.calls[0] as [string]
    expect(url).toContain('namespace=default')
    expect(url).toContain('object=node-1')
  })

  it('sets an error message when the response is not ok', async () => {
    mockAgentFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) })
    const { result } = renderHook(() => useEventsDrillDown('c1', 'ns1', undefined))
    await waitFor(() => expect(result.current.error).toBe('Failed to fetch events'))
    expect(result.current.isLoading).toBe(false)
  })

  it('sets an error message when the fetch throws', async () => {
    mockAgentFetch.mockRejectedValueOnce(new Error('network down'))
    const { result } = renderHook(() => useEventsDrillDown('c1', 'ns1', undefined))
    await waitFor(() => expect(result.current.error).toBe('network down'))
  })

  it('copyCommand copies the field-selector kubectl command and toggles copied flag', async () => {
    vi.useFakeTimers()
    mockAgentFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ events: [] }) })
    const { result } = renderHook(() => useEventsDrillDown('c1', 'ns1', 'pod-x'))

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.copyCommand()
    })
    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('kubectl --context c1 get events --field-selector involvedObject.name=pod-x -n ns1'),
    )
    expect(result.current.copied).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(result.current.copied).toBe(false)
  })
})
