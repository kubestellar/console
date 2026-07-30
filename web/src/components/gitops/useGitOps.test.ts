import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

import '../../test/utils/setupMocks'

// #7993 Phase 4: drift detection now fetches kc-agent's detect-drift
// endpoint directly (not `api.post`). Match by suffix to stay agnostic of
// LOCAL_AGENT_HTTP_URL's host.
const DETECT_DRIFT_PATH_SUFFIX = '/gitops/detect-drift'
const HEALTH_CHECK_PATH = '/api/health'
const ASYNC_WAIT_TIMEOUT_MS = 2000

let mockClusters: Array<{ name: string; context?: string }> = []

const stableRefetch = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: mockClusters, deduplicatedClusters: mockClusters, isRefreshing: false, refetch: stableRefetch,
  }),
  useHelmReleases: () => ({ releases: [] }),
  useOperatorSubscriptions: () => ({ subscriptions: [] }),
}))

const drillToAllHelmSpy = vi.fn()
const drillToAllOperatorsSpy = vi.fn()
vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllHelm: drillToAllHelmSpy, drillToAllOperators: drillToAllOperatorsSpy,
  }),
}))

const showToastSpy = vi.fn()
vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: showToastSpy }),
}))

let demoModeFlag = false

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { useGitOps } from './useGitOps'
import * as useDemoModeModule from '../../hooks/useDemoMode'

type DriftFetchResponse = { ok: boolean; body: unknown }
let driftFetchHandler: () => DriftFetchResponse | Promise<DriftFetchResponse>

describe('useGitOps', () => {
  beforeEach(() => {
    demoModeFlag = false
    mockClusters = []
    stableRefetch.mockClear()
    drillToAllHelmSpy.mockClear()
    drillToAllOperatorsSpy.mockClear()
    showToastSpy.mockClear()
    driftFetchHandler = () => ({ ok: true, body: { drifted: false, resources: [] } })
    vi.spyOn(useDemoModeModule, 'getDemoMode').mockImplementation(() => demoModeFlag)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes(DETECT_DRIFT_PATH_SUFFIX)) {
          const { ok, body } = await driftFetchHandler()
          return { ok, json: () => Promise.resolve(body) } as unknown as Response
        }
        if (url.includes(HEALTH_CHECK_PATH)) {
          return { ok: true, json: () => Promise.resolve({}) } as unknown as Response
        }
        return { ok: true, json: () => Promise.resolve({}) } as unknown as Response
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns initial state with configured apps and empty stats while checking', () => {
    driftFetchHandler = () => new Promise(() => {})
    const { result } = renderHook(() => useGitOps())
    expect(result.current.apps.length).toBeGreaterThan(0)
    expect(result.current.stats.total).toBe(result.current.apps.length)
  })

  it('success path: marks apps synced when no drift is detected', async () => {
    mockClusters = [{ name: 'only', context: 'only' }]
    driftFetchHandler = () => ({ ok: true, body: { drifted: false, resources: [] } })
    const { result } = renderHook(() => useGitOps())

    await waitFor(
      () => expect(result.current.apps.every(a => a.syncStatus === 'synced')).toBe(true),
      { timeout: ASYNC_WAIT_TIMEOUT_MS }
    )
    expect(result.current.stats.drifted).toBe(0)
  })

  it('error path: surfaces drift-check failure without marking apps synced', async () => {
    mockClusters = [{ name: 'only', context: 'only' }]
    driftFetchHandler = () => {
      throw new Error('backend exploded')
    }
    const { result } = renderHook(() => useGitOps())

    await waitFor(
      () => expect(result.current.apps.some(a => a.syncStatus === 'error')).toBe(true),
      { timeout: ASYNC_WAIT_TIMEOUT_MS }
    )
    const errored = result.current.apps.find(a => a.syncStatus === 'error')
    expect(errored?.driftDetails).toEqual(['backend exploded'])
  })

  it('does not detect drift in demo mode', async () => {
    demoModeFlag = true
    const { result } = renderHook(() => useGitOps())
    await waitFor(() => expect(result.current.apps.every(a => a.syncStatus !== 'checking')).toBe(true), {
      timeout: ASYNC_WAIT_TIMEOUT_MS,
    })
  })

  it('handleRefresh triggers refetch of clusters and re-runs drift detection', async () => {
    mockClusters = [{ name: 'only', context: 'only' }]
    const { result } = renderHook(() => useGitOps())
    await waitFor(() => expect(result.current.apps.every(a => a.syncStatus !== 'checking')).toBe(true), {
      timeout: ASYNC_WAIT_TIMEOUT_MS,
    })

    act(() => {
      result.current.handleRefresh()
    })
    expect(stableRefetch).toHaveBeenCalled()
  })

  it('handleSync opens the sync dialog for the given app and handleSyncComplete marks it synced', () => {
    const { result } = renderHook(() => useGitOps())
    const app = result.current.apps[0]

    act(() => {
      result.current.handleSync(app)
    })
    expect(result.current.syncDialogApp).toEqual(app)

    act(() => {
      result.current.handleSyncComplete()
    })
    expect(showToastSpy).toHaveBeenCalledWith(expect.stringContaining(app.name), 'success')
  })
})
