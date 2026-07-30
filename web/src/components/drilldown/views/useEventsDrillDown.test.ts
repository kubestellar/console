import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockGetDemoMode = vi.fn()
const mockAgentFetch = vi.fn()
const mockCopyToClipboard = vi.fn()

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => mockGetDemoMode(),
}))

vi.mock('../../../hooks/mcp/shared', () => ({
  agentFetch: (url: string, init?: RequestInit) => mockAgentFetch(url, init),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: (text: string) => mockCopyToClipboard(text),
}))

import { useEventsDrillDown } from './useEventsDrillDown'

function okResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response
}
function failResponse(): Response {
  return { ok: false, json: async () => ({}) } as unknown as Response
}

describe('useEventsDrillDown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetDemoMode.mockReset()
    mockAgentFetch.mockReset()
    mockCopyToClipboard.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('short-circuits in demo mode without hitting the agent', async () => {
    mockGetDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useEventsDrillDown('c1', 'ns1', 'pod-a'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events).toEqual([])
    expect(result.current.error).toBeNull()
    expect(mockAgentFetch).not.toHaveBeenCalled()
  })

  it('fetches events and passes namespace + object + limit query params', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockAgentFetch.mockResolvedValueOnce(
      okResponse({
        events: [
          { type: 'Warning', reason: 'Fail', message: 'x', object: 'pod-a', namespace: 'ns1', cluster: 'c1', count: 2 },
        ],
      }),
    )

    const { result } = renderHook(() => useEventsDrillDown('c1', 'ns1', 'pod-a'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].reason).toBe('Fail')
    expect(result.current.error).toBeNull()

    const url = mockAgentFetch.mock.calls[0][0] as string
    expect(url).toContain('cluster=c1')
    expect(url).toContain('namespace=ns1')
    expect(url).toContain('object=pod-a')
    expect(url).toContain('limit=100')
  })

  it('uses namespace=default when object is set but namespace is undefined (node events case)', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockAgentFetch.mockResolvedValueOnce(okResponse({ events: [] }))

    renderHook(() => useEventsDrillDown('c1', undefined, 'node-1'))
    await waitFor(() => expect(mockAgentFetch).toHaveBeenCalledTimes(1))

    const url = mockAgentFetch.mock.calls[0][0] as string
    expect(url).toContain('namespace=default')
    expect(url).toContain('object=node-1')
  })

  it('omits object and namespace when both are undefined', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockAgentFetch.mockResolvedValueOnce(okResponse({ events: [] }))

    renderHook(() => useEventsDrillDown('c1', undefined, undefined))
    await waitFor(() => expect(mockAgentFetch).toHaveBeenCalledTimes(1))

    const url = mockAgentFetch.mock.calls[0][0] as string
    expect(url).not.toContain('namespace=')
    expect(url).not.toContain('object=')
    expect(url).toContain('cluster=c1')
    expect(url).toContain('limit=100')
  })

  it('sets error string when response is not ok', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockAgentFetch.mockResolvedValueOnce(failResponse())

    const { result } = renderHook(() => useEventsDrillDown('c1', 'ns1', 'pod-a'))
    await waitFor(() => expect(result.current.error).toBe('Failed to fetch events'))
    expect(result.current.events).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('surfaces thrown Error message via error field', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockAgentFetch.mockRejectedValueOnce(new Error('boom'))

    const { result } = renderHook(() => useEventsDrillDown('c1', 'ns1', 'pod-a'))
    await waitFor(() => expect(result.current.error).toBe('boom'))
  })

  it('copyCommand builds an object-scoped kubectl command and sets copied flag', async () => {
    mockGetDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useEventsDrillDown('c1', 'ns1', 'pod-a'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.copyCommand()
    })
    expect(mockCopyToClipboard).toHaveBeenCalledTimes(1)
    const cmd = mockCopyToClipboard.mock.calls[0][0] as string
    expect(cmd).toBe(
      'kubectl --context c1 get events --field-selector involvedObject.name=pod-a -n ns1',
    )
    expect(result.current.copied).toBe(true)
  })

  it('copyCommand builds an all-namespaces command when no object is given', async () => {
    mockGetDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useEventsDrillDown('c1', undefined, undefined))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.copyCommand()
    })
    const cmd = mockCopyToClipboard.mock.calls[0][0] as string
    expect(cmd).toBe('kubectl --context c1 get events -A --sort-by=.lastTimestamp')
  })
})
