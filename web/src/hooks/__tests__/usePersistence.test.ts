import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockAgentStatus = 'connected'
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../useLocalAgent', () => ({
  useLocalAgent: () => ({ status: mockAgentStatus }),
}))

let mockToken: string | null = 'real-token-123'
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ token: mockToken }),
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  POLL_INTERVAL_MS: 60_000_000, // Very large so interval never fires during tests
}))

import { usePersistence, useShouldUsePersistence } from '../usePersistence'
import type { PersistenceConfig, PersistenceStatus } from '../usePersistence'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockConfigResponse: PersistenceConfig = {
  enabled: true,
  primaryCluster: 'prod-us-east',
  secondaryCluster: 'prod-us-west',
  namespace: 'kubestellar-console',
  syncMode: 'active-passive',
  lastModified: '2026-01-15T12:00:00Z',
}

const mockStatusResponse: PersistenceStatus = {
  active: true,
  activeCluster: 'prod-us-east',
  primaryHealth: 'healthy',
  secondaryHealth: 'healthy',
  lastSync: '2026-01-15T11:59:00Z',
  failoverActive: false,
  message: 'All systems operational',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgentStatus = 'connected'
    mockToken = 'real-token-123'
    // Default: config returns enabled config, status returns active
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) }) // fetchConfig
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // fetchStatus (any subsequent call)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // 1. Initial loading state
  // -------------------------------------------------------------------------

  it('starts in a loading state', () => {
    const { result } = renderHook(() => usePersistence())
    expect(result.current.loading).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 2. Fetches config on mount
  // -------------------------------------------------------------------------

  it('fetches config and populates state on mount', async () => {
    const { result } = renderHook(() => usePersistence())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.config.enabled).toBe(true)
    expect(result.current.config.primaryCluster).toBe('prod-us-east')
    expect(result.current.config.syncMode).toBe('active-passive')
  })

  // -------------------------------------------------------------------------
  // 3. Backend unavailable - skips fetch
  // -------------------------------------------------------------------------

  it('does not fetch when backend is disconnected', async () => {
    mockAgentStatus = 'disconnected'
    global.fetch = vi.fn()

    const { result } = renderHook(() => usePersistence())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(global.fetch).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 4. Demo token - skips fetch
  // -------------------------------------------------------------------------

  it('does not fetch when using demo-token', async () => {
    mockToken = 'demo-token'
    global.fetch = vi.fn()

    const { result } = renderHook(() => usePersistence())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(global.fetch).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 5. Null token - skips fetch
  // -------------------------------------------------------------------------

  it('does not fetch when token is null', async () => {
    mockToken = null
    global.fetch = vi.fn()

    const { result } = renderHook(() => usePersistence())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(global.fetch).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 6. Fetch config error
  // -------------------------------------------------------------------------

  it('sets error when config fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => usePersistence())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Failed to load persistence config')
  })

  // -------------------------------------------------------------------------
  // 7. Update config successfully
  // -------------------------------------------------------------------------

  it('updates config via PUT and refreshes status', async () => {
    const updatedConfig = { ...mockConfigResponse, namespace: 'new-ns' }
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) }) // initial fetchConfig
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // initial fetchStatus
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(updatedConfig) }) // updateConfig PUT
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // fetchStatus after update

    const { result } = renderHook(() => usePersistence())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.updateConfig({ namespace: 'new-ns' })
    })

    expect(success).toBe(true)
    expect(result.current.config.namespace).toBe('new-ns')
    expect(result.current.error).toBeNull()
  })

  // -------------------------------------------------------------------------
  // 8. Update config failure (non-ok response)
  // -------------------------------------------------------------------------

  it('sets error when updateConfig returns non-ok', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) }) // initial config
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // initial status
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Validation failed' }),
      }) // PUT fails

    const { result } = renderHook(() => usePersistence())

    await waitFor(() => expect(result.current.loading).toBe(false))

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.updateConfig({ primaryCluster: '' })
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Validation failed')
  })

  // -------------------------------------------------------------------------
  // 9. Update config when backend is unavailable
  // -------------------------------------------------------------------------

  it('returns false and sets error when updating without backend', async () => {
    mockAgentStatus = 'disconnected'
    global.fetch = vi.fn()

    const { result } = renderHook(() => usePersistence())

    await waitFor(() => expect(result.current.loading).toBe(false))

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.updateConfig({ enabled: true })
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Backend not available')
  })

  // -------------------------------------------------------------------------
  // 10. Enable persistence
  // -------------------------------------------------------------------------

  it('enablePersistence sets enabled=true with cluster and options', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...mockConfigResponse, enabled: false }) }) // initial config
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) }) // PUT response
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // status refresh

    const { result } = renderHook(() => usePersistence())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.enablePersistence('prod', {
        secondaryCluster: 'dr-site',
        syncMode: 'active-passive',
      })
    })

    // Verify the PUT was called with correct body
    const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[1] as RequestInit)?.method === 'PUT'
    )
    expect(putCall).toBeDefined()
    const body = JSON.parse((putCall![1] as RequestInit).body as string)
    expect(body.enabled).toBe(true)
    expect(body.primaryCluster).toBe('prod')
    expect(body.secondaryCluster).toBe('dr-site')
    expect(body.syncMode).toBe('active-passive')
  })

  // -------------------------------------------------------------------------
  // 11. Disable persistence
  // -------------------------------------------------------------------------

  it('disablePersistence sets enabled=false', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) }) // initial config
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // initial status
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...mockConfigResponse, enabled: false }) }) // PUT
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...mockStatusResponse, active: false }) }) // status

    const { result } = renderHook(() => usePersistence())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.disablePersistence()
    })

    const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[1] as RequestInit)?.method === 'PUT'
    )
    const body = JSON.parse((putCall![1] as RequestInit).body as string)
    expect(body.enabled).toBe(false)
  })

  // -------------------------------------------------------------------------
  // 12. Test connection - success
  // -------------------------------------------------------------------------

  it('testConnection returns health info on success', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) }) // initial config
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // initial status
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ cluster: 'test-cluster', health: 'healthy', success: true }),
      }) // test connection

    const { result } = renderHook(() => usePersistence())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let testResult: { cluster: string; health: string; success: boolean } | undefined
    await act(async () => {
      testResult = await result.current.testConnection('test-cluster')
    })

    expect(testResult!.success).toBe(true)
    expect(testResult!.health).toBe('healthy')
  })

  // -------------------------------------------------------------------------
  // 13. Test connection - backend unavailable
  // -------------------------------------------------------------------------

  it('testConnection returns unknown when backend unavailable', async () => {
    mockAgentStatus = 'disconnected'
    global.fetch = vi.fn()

    const { result } = renderHook(() => usePersistence())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let testResult: { cluster: string; health: string; success: boolean } | undefined
    await act(async () => {
      testResult = await result.current.testConnection('test-cluster')
    })

    expect(testResult!.success).toBe(false)
    expect(testResult!.health).toBe('unknown')
  })

  // -------------------------------------------------------------------------
  // 14. Test connection - fetch fails
  // -------------------------------------------------------------------------

  it('testConnection returns fallback on network error', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) }) // initial config
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // initial status
      .mockRejectedValueOnce(new Error('Network error')) // test connection

    const { result } = renderHook(() => usePersistence())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let testResult: { cluster: string; health: string; success: boolean } | undefined
    await act(async () => {
      testResult = await result.current.testConnection('failing-cluster')
    })

    expect(testResult!.success).toBe(false)
    expect(testResult!.cluster).toBe('failing-cluster')
  })

  // -------------------------------------------------------------------------
  // 15. Sync now - success
  // -------------------------------------------------------------------------

  it('syncNow triggers sync and refreshes status', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) }) // initial config
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // initial status
      .mockResolvedValueOnce({ ok: true }) // POST sync
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // status refresh

    const { result } = renderHook(() => usePersistence())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.syncNow()
    })

    expect(success).toBe(true)
    expect(result.current.syncing).toBe(false)
  })

  // -------------------------------------------------------------------------
  // 16. Sync now - disabled
  // -------------------------------------------------------------------------

  it('syncNow returns false when persistence is disabled', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ...mockConfigResponse, enabled: false }),
      })

    const { result } = renderHook(() => usePersistence())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.syncNow()
    })

    expect(success).toBe(false)
  })

  // -------------------------------------------------------------------------
  // 17. Computed properties
  // -------------------------------------------------------------------------

  it('exposes computed properties from config and status', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(mockStatusResponse) })

    const { result } = renderHook(() => usePersistence())

    await waitFor(() => {
      expect(result.current.isEnabled).toBe(true)
    })
    expect(result.current.isActive).toBe(true)
    expect(result.current.activeCluster).toBe('prod-us-east')
    expect(result.current.isFailover).toBe(false)
  })

  // -------------------------------------------------------------------------
  // 18. Default state when not configured
  // -------------------------------------------------------------------------

  it('uses default values before fetch completes', () => {
    // Never resolve the fetch
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePersistence())

    expect(result.current.isEnabled).toBe(false)
    expect(result.current.isActive).toBe(false)
    expect(result.current.activeCluster).toBe('')
    expect(result.current.status.message).toBe('Not configured')
  })

  // -------------------------------------------------------------------------
  // 19. updateConfig network error
  // -------------------------------------------------------------------------

  it('sets generic error on updateConfig network failure', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) }) // initial config
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // initial status
      .mockRejectedValueOnce(new Error('Connection refused')) // PUT

    const { result } = renderHook(() => usePersistence())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.updateConfig({ namespace: 'test' })
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Failed to update config')
  })

  // -------------------------------------------------------------------------
  // 20. enablePersistence defaults
  // -------------------------------------------------------------------------

  it('enablePersistence uses defaults for namespace and syncMode', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...mockConfigResponse, enabled: false }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) }) // PUT response
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStatusResponse) }) // status refresh

    const { result } = renderHook(() => usePersistence())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.enablePersistence('my-cluster')
    })

    const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[1] as RequestInit)?.method === 'PUT'
    )
    const body = JSON.parse((putCall![1] as RequestInit).body as string)
    expect(body.namespace).toBe('kubestellar-console')
    expect(body.syncMode).toBe('primary-only')
  })
})

// ---------------------------------------------------------------------------
// useShouldUsePersistence
// ---------------------------------------------------------------------------

describe('useShouldUsePersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgentStatus = 'connected'
    mockToken = 'real-token-123'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when enabled AND active', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfigResponse) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(mockStatusResponse) })

    const { result } = renderHook(() => useShouldUsePersistence())

    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('returns false when not enabled', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ...mockConfigResponse, enabled: false }),
      })

    const { result } = renderHook(() => useShouldUsePersistence())

    // Default state (before fetch) has enabled=false, so should be false
    expect(result.current).toBe(false)
  })
})
