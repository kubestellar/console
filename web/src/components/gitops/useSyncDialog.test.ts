import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

import '../../test/utils/setupMocks'

// Expected endpoint hit by the hook. #7993 Phase 4 moved drift detection to
// kc-agent, so the hook fetches ${LOCAL_AGENT_HTTP_URL}/gitops/detect-drift
// and ${LOCAL_AGENT_HTTP_URL}/gitops/sync. We match on the path suffix to
// stay agnostic of the exact agent host.
const DETECT_DRIFT_PATH_SUFFIX = '/gitops/detect-drift'
const SYNC_PATH_SUFFIX = '/gitops/sync'
const ASYNC_WAIT_TIMEOUT_MS = 2000

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

import { useSyncDialog } from './useSyncDialog'

type FetchMock = ReturnType<typeof vi.fn>

function makeFetchMock(impl: (url: string) => Promise<Response>): FetchMock {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    return impl(url)
  }) as FetchMock
}

function mockResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('useSyncDialog', () => {
  const defaultProps = {
    isOpen: true,
    appName: 'test-app',
    namespace: 'default',
    cluster: 'test-cluster',
    repoUrl: 'https://github.com/test/repo',
    path: 'deploy/',
    onSyncComplete: vi.fn(),
    onClose: vi.fn(),
  }

  let fetchMock: FetchMock

  beforeEach(() => {
    fetchMock = makeFetchMock(() => Promise.resolve(mockResponse({ drifted: false, resources: [] })))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns initial detection-phase state when closed', () => {
    const { result } = renderHook(() => useSyncDialog({ ...defaultProps, isOpen: false }))
    expect(result.current.phase).toBe('detection')
    expect(result.current.driftedResources).toEqual([])
    expect(result.current.syncLogs).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('success path: runs detection on open and transitions to plan phase with no drift', async () => {
    const { result } = renderHook(() => useSyncDialog(defaultProps))

    await waitFor(() => expect(result.current.phase).toBe('plan'), { timeout: ASYNC_WAIT_TIMEOUT_MS })
    expect(result.current.driftedResources).toEqual([])
    expect(result.current.error).toBeNull()

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain(DETECT_DRIFT_PATH_SUFFIX)
  })

  it('success path: populates driftedResources and sync plan when drift is found', async () => {
    fetchMock = makeFetchMock(() =>
      Promise.resolve(
        mockResponse({
          drifted: true,
          resources: [
            { kind: 'Deployment', name: 'frontend', namespace: 'default', field: 'replicas', gitValue: '3', clusterValue: '5' },
          ],
        })
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSyncDialog(defaultProps))

    await waitFor(() => expect(result.current.phase).toBe('plan'), { timeout: ASYNC_WAIT_TIMEOUT_MS })
    expect(result.current.driftedResources).toHaveLength(1)
    expect(result.current.syncPlan).toEqual([
      { action: 'update', resource: 'Deployment/frontend', details: 'replicas: 5 → 3' },
    ])
  })

  it('error path: sets error and logs failure when detection fails', async () => {
    fetchMock = makeFetchMock(() => Promise.resolve(mockResponse({ error: 'boom: backend down' }, false)))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSyncDialog(defaultProps))

    await waitFor(() => expect(result.current.error).toBe('boom: backend down'), { timeout: ASYNC_WAIT_TIMEOUT_MS })
    expect(result.current.phase).toBe('detection')
    expect(result.current.syncLogs.some(l => l.status === 'error')).toBe(true)
  })

  it('runSync success path: applies resources and transitions to complete phase', async () => {
    fetchMock = makeFetchMock((url) => {
      if (url.includes(SYNC_PATH_SUFFIX)) {
        return Promise.resolve(mockResponse({ success: true, applied: ['Deployment/frontend'], errors: [] }))
      }
      return Promise.resolve(mockResponse({ drifted: false, resources: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSyncDialog(defaultProps))
    await waitFor(() => expect(result.current.phase).toBe('plan'), { timeout: ASYNC_WAIT_TIMEOUT_MS })

    await act(async () => {
      await result.current.runSync()
    })

    expect(result.current.phase).toBe('complete')
    expect(result.current.syncLogs.some(l => l.message.includes('Deployment/frontend'))).toBe(true)
  })

  it('runSync error path: surfaces sync failure message', async () => {
    fetchMock = makeFetchMock((url) => {
      if (url.includes(SYNC_PATH_SUFFIX)) {
        return Promise.resolve(mockResponse({ error: 'sync boom' }, false))
      }
      return Promise.resolve(mockResponse({ drifted: false, resources: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSyncDialog(defaultProps))
    await waitFor(() => expect(result.current.phase).toBe('plan'), { timeout: ASYNC_WAIT_TIMEOUT_MS })

    await act(async () => {
      await result.current.runSync()
    })

    expect(result.current.error).toBe('sync boom')
  })

  it('handleClose calls onSyncComplete only when phase is complete', async () => {
    fetchMock = makeFetchMock((url) => {
      if (url.includes(SYNC_PATH_SUFFIX)) {
        return Promise.resolve(mockResponse({ success: true, applied: [], errors: [] }))
      }
      return Promise.resolve(mockResponse({ drifted: false, resources: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSyncDialog(defaultProps))
    await waitFor(() => expect(result.current.phase).toBe('plan'), { timeout: ASYNC_WAIT_TIMEOUT_MS })

    act(() => {
      result.current.handleClose()
    })
    expect(defaultProps.onSyncComplete).not.toHaveBeenCalled()
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.runSync()
    })
    expect(result.current.phase).toBe('complete')

    act(() => {
      result.current.handleClose()
    })
    expect(defaultProps.onSyncComplete).toHaveBeenCalledTimes(1)
    expect(defaultProps.onClose).toHaveBeenCalledTimes(2)
  })
})
