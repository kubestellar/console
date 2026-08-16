/* Split from agentConnectivity.test.tsx for focused test modules. */
import React from 'react'
/**
 * Tests for agent connectivity detection and loopback failure paths.
 *
 * Validates that connection refused, timeout, and agent unavailable
 * scenarios produce consistent error states and user-facing messages.
 * Covers:
 *   - Agent offline → correct error state + demo fallback
 *   - Connection refused → transitions through failure threshold
 *   - HTTP error statuses (502, 503, 504) → appropriate disconnect
 *   - Timeout (AbortError) → treated as failure
 *   - Reconnection after recovery → hysteresis prevents flicker
 *   - Degraded mode transitions → data errors vs health errors
 *   - Error message consistency across failure types
 *   - Non-hook utility function behavior during failures
 *   - Aggressive detection reset on user-initiated retry
 *
 * Issue #11591 — agent connectivity and loopback failure paths not validated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before module import
// ---------------------------------------------------------------------------

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
  isDemoModeForced: false,
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => false,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
}))

const mockEmitAgentConnected = vi.fn()
const mockEmitAgentDisconnected = vi.fn()
const mockEmitAgentProvidersDetected = vi.fn()
const mockEmitConversionStep = vi.fn()

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitAgentConnected: (...args: unknown[]) => mockEmitAgentConnected(...args),
  emitAgentDisconnected: (...args: unknown[]) => mockEmitAgentDisconnected(...args),
  emitAgentProvidersDetected: (...args: unknown[]) => mockEmitAgentProvidersDetected(...args),
  emitConversionStep: (...args: unknown[]) => mockEmitConversionStep(...args),
}
))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

// Mock AlertsContext service modules (added after #11559 refactor)
vi.mock('../../contexts/notifications', () => ({
  shouldDispatchBrowserNotification: vi.fn(() => false),
  isClusterUnreachable: vi.fn(() => false),
  sendNotifications: vi.fn(),
  sendBatchedNotifications: vi.fn(),
}))
vi.mock('../../contexts/alertStorage', () => ({
  ALERTS_KEY: 'kc_alerts',
  MAX_ALERTS: 500,
  loadNotifiedAlertKeys: vi.fn(() => new Map()),
  saveNotifiedAlertKeys: vi.fn(),
  loadFromStorage: vi.fn(() => []),
  saveToStorage: vi.fn(),
  saveAlerts: vi.fn(),
  STORAGE_KEY_AUTH_TOKEN: 'auth_token',
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  DEFAULT_TEMPERATURE_THRESHOLD_F: 100,
  DEFAULT_WIND_SPEED_THRESHOLD_MPH: 40,
}))
vi.mock('../../contexts/alertRunbooks', () => ({
  findAndExecuteRunbook: vi.fn(() => Promise.resolve(null)),
}))

// Dynamically imported after each module reset
let useLocalAgent: typeof import('../useLocalAgent').useLocalAgent
let reportAgentDataError: typeof import('../useLocalAgent').reportAgentDataError
let reportAgentDataSuccess: typeof import('../useLocalAgent').reportAgentDataSuccess
let isAgentConnected: typeof import('../useLocalAgent').isAgentConnected
let isAgentUnavailable: typeof import('../useLocalAgent').isAgentUnavailable
let wasAgentEverConnected: typeof import('../useLocalAgent').wasAgentEverConnected
let triggerAggressiveDetection: typeof import('../useLocalAgent').triggerAggressiveDetection

const POLL_INTERVAL = 5_000
const DISCONNECTED_POLL_INTERVAL = 60_000
const FAILURE_THRESHOLD = 2
const UNAUTHORIZED_STATUS = 401

const healthData = {
  status: 'ok',
  version: '1.0.0',
  clusters: 3,
  hasClaude: true,
  availableProviders: [{ name: 'claude', displayName: 'Claude', capabilities: 3 }],
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function advanceUntilDisconnected(currentStatus: () => string, maxAttempts = 4) {
  for (let i = 0; i < maxAttempts; i++) {
    if (currentStatus() === 'disconnected') {
      return
    }
    await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
    await flushMicrotasks()
  }
}

function mockFetchOk(data = healthData) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  })
}

function mockFetchReject(msg = 'Connection refused') {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(msg))
}

function mockFetchHang() {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    () => new Promise(() => {})
  )
}

function mockFetchStatus(status: number) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  })
}

function mockFetchAuthError(status = UNAUTHORIZED_STATUS, data = healthData) {
  ;(global.fetch as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    })
    .mockResolvedValueOnce({
      ok: false,
      status,
      json: () => Promise.resolve({}),
    })
}

/** Drive agent to disconnected by exhausting the failure threshold. */
async function driveToDisconnected() {
  mockFetchReject()
  await flushMicrotasks()
  for (let i = 1; i < FAILURE_THRESHOLD; i++) {
    await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
    await flushMicrotasks()
  }
}

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    mockEmitAgentConnected.mockClear()
    mockEmitAgentDisconnected.mockClear()
    mockEmitAgentProvidersDetected.mockClear()
    mockEmitConversionStep.mockClear()

    vi.stubGlobal('fetch', vi.fn())

    const mod = await import('../useLocalAgent')
    useLocalAgent = mod.useLocalAgent
    reportAgentDataError = mod.reportAgentDataError
    reportAgentDataSuccess = mod.reportAgentDataSuccess
    isAgentConnected = mod.isAgentConnected
    isAgentUnavailable = mod.isAgentUnavailable
    wasAgentEverConnected = mod.wasAgentEverConnected
    triggerAggressiveDetection = mod.triggerAggressiveDetection
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // ===========================================================================
  // Connection Refused Scenarios
  // ===========================================================================

  describe('degraded mode (health ok, data endpoints failing)', () => {
    it('3 data errors within 60s → degraded status', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()

      act(() => { reportAgentDataError('/clusters', 'HTTP 503') })
      act(() => { reportAgentDataError('/pods', 'HTTP 502') })
      act(() => { reportAgentDataError('/deployments', 'Timeout') })

      expect(result.current.status).toBe('degraded')
      expect(result.current.isDegraded).toBe(true)
      // degraded is still "connected" for agent-dependent flows
      expect(result.current.isConnected).toBe(true)
    })

    it('isAgentConnected() returns true when degraded', async () => {
      mockFetchOk()
      renderHook(() => useLocalAgent())
      await flushMicrotasks()

      act(() => { reportAgentDataError('/a', 'err') })
      act(() => { reportAgentDataError('/b', 'err') })
      act(() => { reportAgentDataError('/c', 'err') })

      expect(isAgentConnected()).toBe(true)
    })

    it('isAgentUnavailable() returns false when degraded', async () => {
      mockFetchOk()
      renderHook(() => useLocalAgent())
      await flushMicrotasks()

      act(() => { reportAgentDataError('/a', 'err') })
      act(() => { reportAgentDataError('/b', 'err') })
      act(() => { reportAgentDataError('/c', 'err') })

      expect(isAgentUnavailable()).toBe(false)
    })

    it('data errors are tracked with timestamps and counted correctly', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()

      act(() => { reportAgentDataError('/ep1', 'error 1') })
      act(() => { reportAgentDataError('/ep2', 'error 2') })
      act(() => { reportAgentDataError('/ep3', 'error 3') })

      expect(result.current.dataErrorCount).toBeGreaterThanOrEqual(3)
      expect(result.current.lastDataError).toContain('/ep3')
    })

    it('data success recovers from degraded after errors age out', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()

      act(() => { reportAgentDataError('/a', 'err') })
      act(() => { reportAgentDataError('/b', 'err') })
      act(() => { reportAgentDataError('/c', 'err') })
      expect(result.current.status).toBe('degraded')

      // Prevent health polls from resetting status
      mockFetchHang()

      // Advance past the 60s error window
      await act(async () => { vi.advanceTimersByTime(61_000) })
      await flushMicrotasks()

      act(() => { reportAgentDataSuccess() })
      expect(result.current.status).toBe('connected')
      expect(result.current.dataErrorCount).toBe(0)
    })

    it('data errors while disconnected do not trigger degraded', async () => {
      mockFetchReject()
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      expect(result.current.status).toBe('disconnected')

      act(() => { reportAgentDataError('/a', 'err') })
      act(() => { reportAgentDataError('/b', 'err') })
      act(() => { reportAgentDataError('/c', 'err') })

      // Still disconnected, not degraded
      expect(result.current.status).toBe('disconnected')
    })
  })

  // ===========================================================================
  // Aggressive Detection (User-Initiated Retry)
  // ===========================================================================

  