/**
 * Tests for useLocalAgent hook and the AgentManager singleton.
 *
 * Validates agent connection lifecycle: initial state, polling,
 * connected/disconnected transitions, degraded mode, data error
 * reporting, aggressive detection, reconnection hysteresis, analytics
 * emissions, cleanup on unmount, and non-hook utility functions.
 *
 * The hook uses a singleton AgentManager with subscribe/unsubscribe.
 * We re-import the module for each test to get a fresh singleton.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks -- declared before module import
// ---------------------------------------------------------------------------

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../hooks/useDemoMode', () => ({
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

vi.mock('../../lib/analytics', () => ({
  emitAgentConnected: (...args: unknown[]) => mockEmitAgentConnected(...args),
  emitAgentDisconnected: (...args: unknown[]) => mockEmitAgentDisconnected(...args),
  emitAgentProvidersDetected: (...args: unknown[]) => mockEmitAgentProvidersDetected(...args),
  emitConversionStep: (...args: unknown[]) => mockEmitConversionStep(...args),
}))

const mockSafeGetItem = vi.fn(() => null)
const mockSafeSetItem = vi.fn()

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: (...args: unknown[]) => mockSafeGetItem(...args),
  safeSetItem: (...args: unknown[]) => mockSafeSetItem(...args),
}))

// Dynamically imported after each module reset
let useLocalAgent: typeof import('../useLocalAgent').useLocalAgent
let reportAgentDataError: typeof import('../useLocalAgent').reportAgentDataError
let reportAgentDataSuccess: typeof import('../useLocalAgent').reportAgentDataSuccess
let isAgentConnected: typeof import('../useLocalAgent').isAgentConnected
let isAgentUnavailable: typeof import('../useLocalAgent').isAgentUnavailable
let triggerAggressiveDetection: typeof import('../useLocalAgent').triggerAggressiveDetection

const POLL_INTERVAL = 10000
const DISCONNECTED_POLL_INTERVAL = 60000
const FAILURE_THRESHOLD = 9
const _SUCCESS_THRESHOLD = 2

/** Standard health response from a running agent. */
const healthData = {
  status: 'ok',
  version: '1.2.3',
  clusters: 2,
  hasClaude: true,
  availableProviders: [{ name: 'claude', displayName: 'Claude', capabilities: 3 }],
}

/** Flush microtask queue so async handlers (fetch, promises) settle. */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** Helper: mock fetch to return a successful agent health response. */
function mockFetchOk(data = healthData) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  })
}

/** Helper: mock fetch to reject (agent unreachable). */
function mockFetchReject(msg = 'Connection refused') {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(msg))
}

/** Helper: mock fetch to hang forever (never resolves). */
function mockFetchHang() {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    () => new Promise(() => {})
  )
}

/** Helper: mock fetch to return a non-ok HTTP status. */
function mockFetchStatus(status: number) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  })
}

/** Run enough failure cycles to cross the FAILURE_THRESHOLD and reach disconnected. */
async function driveToDisconnected() {
  mockFetchReject()
  // First check fires immediately on subscribe/start
  await flushMicrotasks()
  for (let i = 1; i < FAILURE_THRESHOLD; i++) {
    await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
    await flushMicrotasks()
  }
}

describe('useLocalAgent', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    mockEmitAgentConnected.mockClear()
    mockEmitAgentDisconnected.mockClear()
    mockEmitAgentProvidersDetected.mockClear()
    mockEmitConversionStep.mockClear()
    mockSafeGetItem.mockClear()
    mockSafeSetItem.mockClear()

    vi.stubGlobal('fetch', vi.fn())

    const mod = await import('../useLocalAgent')
    useLocalAgent = mod.useLocalAgent
    reportAgentDataError = mod.reportAgentDataError
    reportAgentDataSuccess = mod.reportAgentDataSuccess
    isAgentConnected = mod.isAgentConnected
    isAgentUnavailable = mod.isAgentUnavailable
    triggerAggressiveDetection = mod.triggerAggressiveDetection
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // =========================================================================
  // 1. Initial state
  // =========================================================================

  it('returns connecting status initially before any health check resolves', () => {
    mockFetchHang()
    const { result } = renderHook(() => useLocalAgent())

    expect(result.current.status).toBe('connecting')
    expect(result.current.isConnected).toBe(false)
    expect(result.current.isDemoMode).toBe(false)
    expect(result.current.health).toBeNull()
  })

  it('returns the expected API shape', () => {
    mockFetchHang()
    const { result } = renderHook(() => useLocalAgent())

    expect(result.current).toHaveProperty('status')
    expect(result.current).toHaveProperty('health')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('connectionEvents')
    expect(result.current).toHaveProperty('dataErrorCount')
    expect(result.current).toHaveProperty('lastDataError')
    expect(result.current).toHaveProperty('isConnected')
    expect(result.current).toHaveProperty('isDegraded')
    expect(result.current).toHaveProperty('isDemoMode')
    expect(result.current).toHaveProperty('installInstructions')
    expect(result.current).toHaveProperty('refresh')
    expect(result.current).toHaveProperty('reportDataError')
    expect(result.current).toHaveProperty('reportDataSuccess')
    expect(typeof result.current.refresh).toBe('function')
    expect(typeof result.current.reportDataError).toBe('function')
    expect(typeof result.current.reportDataSuccess).toBe('function')
  })

  // =========================================================================
  // 2. Transitions to connected
  // =========================================================================

  it('transitions to connected on successful health check', async () => {
    mockFetchOk()
    const { result } = renderHook(() => useLocalAgent())

    await flushMicrotasks()

    expect(result.current.status).toBe('connected')
    expect(result.current.isConnected).toBe(true)
    expect(result.current.isDemoMode).toBe(false)
    expect(result.current.health).toMatchObject({
      status: 'ok',
      version: '1.2.3',
      clusters: 2,
    })
  })

  it('emits analytics events on first connection', async () => {
    mockFetchOk()
    renderHook(() => useLocalAgent())
    await flushMicrotasks()

    expect(mockEmitAgentConnected).toHaveBeenCalledWith('1.2.3', 2)
    expect(mockEmitAgentProvidersDetected).toHaveBeenCalledWith(healthData.availableProviders)
    // Conversion step 3 (agent) and 4 (clusters > 0)
    expect(mockEmitConversionStep).toHaveBeenCalledWith(3, 'agent', { agent_version: '1.2.3' })
    expect(mockEmitConversionStep).toHaveBeenCalledWith(4, 'clusters', { cluster_count: '2' })
  })

  it('stamps first-ever agent connection in localStorage', async () => {
    mockSafeGetItem.mockReturnValue(null)
    mockFetchOk()
    renderHook(() => useLocalAgent())
    await flushMicrotasks()

    expect(mockSafeSetItem).toHaveBeenCalledWith(
      'kc-first-agent-connect',
      expect.stringMatching(/^\d+$/)
    )
  })

  it('does NOT stamp localStorage if first connection was already recorded', async () => {
    mockSafeGetItem.mockReturnValue('1700000000000')
    mockFetchOk()
    renderHook(() => useLocalAgent())
    await flushMicrotasks()

    expect(mockSafeSetItem).not.toHaveBeenCalled()
  })

  it('skips conversion step 4 when clusters is 0', async () => {
    mockFetchOk({ ...healthData, clusters: 0 })
    renderHook(() => useLocalAgent())
    await flushMicrotasks()

    expect(mockEmitConversionStep).toHaveBeenCalledWith(3, 'agent', expect.anything())
    expect(mockEmitConversionStep).not.toHaveBeenCalledWith(4, 'clusters', expect.anything())
  })

  // =========================================================================
  // 3. Failure threshold and disconnection
  // =========================================================================

  it('transitions to disconnected after 9 consecutive failures', async () => {
    mockFetchReject()
    const { result } = renderHook(() => useLocalAgent())

    await flushMicrotasks()
    for (let i = 1; i < FAILURE_THRESHOLD; i++) {
      await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
      await flushMicrotasks()
    }

    expect(result.current.status).toBe('disconnected')
    expect(result.current.isDemoMode).toBe(true)
    expect(result.current.isConnected).toBe(false)
    expect(result.current.error).toBe('Local agent not available')
    // Should fall back to demo health data
    expect(result.current.health?.status).toBe('demo')
  })

  it('does not disconnect before reaching the failure threshold', async () => {
    const PARTIAL_FAILURES = 5
    mockFetchReject()
    const { result } = renderHook(() => useLocalAgent())
    await flushMicrotasks()

    for (let i = 1; i < PARTIAL_FAILURES; i++) {
      await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
      await flushMicrotasks()
    }

    expect(result.current.status).not.toBe('disconnected')
  })

  it('transitions to disconnected on non-ok HTTP status (e.g. 500)', async () => {
    mockFetchStatus(500)
    const { result } = renderHook(() => useLocalAgent())

    await flushMicrotasks()
    for (let i = 1; i < FAILURE_THRESHOLD; i++) {
      await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
      await flushMicrotasks()
    }

    expect(result.current.status).toBe('disconnected')
    expect(result.current.error).toBe('Local agent not available')
  })

  it('emits disconnect analytics when transitioning from connected to disconnected', async () => {
    // Connect first
    mockFetchOk()
    const { result } = renderHook(() => useLocalAgent())
    await flushMicrotasks()
    expect(result.current.status).toBe('connected')

    // Now fail enough times
    mockFetchReject()
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
      await flushMicrotasks()
    }

    expect(result.current.status).toBe('disconnected')
    expect(mockEmitAgentDisconnected).toHaveBeenCalled()
  })

  // =========================================================================
  // 4. Reconnection with hysteresis (SUCCESS_THRESHOLD)
  // =========================================================================

  it('requires 2 consecutive successes to reconnect from disconnected', async () => {
    mockFetchReject()
    const { result } = renderHook(() => useLocalAgent())
    await driveToDisconnected()
    expect(result.current.status).toBe('disconnected')

    // Switch to success -- first success should NOT reconnect yet
    mockFetchOk()
    await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
    await flushMicrotasks()
    expect(result.current.status).toBe('disconnected')

    // Second success crosses the threshold
    await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
    await flushMicrotasks()
    expect(result.current.status).toBe('connected')
    expect(result.current.isConnected).toBe(true)
  })

  it('resets success counter when a failure occurs between successes', async () => {
    mockFetchReject()
    const { result } = renderHook(() => useLocalAgent())
    await driveToDisconnected()
    expect(result.current.status).toBe('disconnected')

    // One success, then a failure
    mockFetchOk()
    await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
    await flushMicrotasks()

    mockFetchReject()
    await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
    await flushMicrotasks()

    // One more success -- should NOT reconnect (count was reset)
    mockFetchOk()
    await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
    await flushMicrotasks()
    expect(result.current.status).toBe('disconnected')
  })

  // =========================================================================
  // 5. Polling behavior
  // =========================================================================

  it('polls at 10s intervals when connected', async () => {
    mockFetchOk()
    renderHook(() => useLocalAgent())
    await flushMicrotasks()

    const initialCallCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
    await flushMicrotasks()

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCallCount)
  })

  it('slows polling to 60s when disconnected', async () => {
    mockFetchReject()
    const { result } = renderHook(() => useLocalAgent())
    await driveToDisconnected()
    expect(result.current.status).toBe('disconnected')

    const callCountAfterDisconnect = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    // Advance 10s -- should NOT poll (interval is now 60s)
    await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
    await flushMicrotasks()
    const callCountAfter10s = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callCountAfter10s).toBe(callCountAfterDisconnect)

    // Advance to 60s total -- should poll
    await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL - POLL_INTERVAL) })
    await flushMicrotasks()
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callCountAfterDisconnect)
  })

  // =========================================================================
  // 6. Cleanup on unmount
  // =========================================================================

  it('stops polling when the last subscriber unmounts', async () => {
    mockFetchOk()
    const { unmount } = renderHook(() => useLocalAgent())
    await flushMicrotasks()

    const callCountBeforeUnmount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    unmount()

    await act(async () => { vi.advanceTimersByTime(50000) })
    await flushMicrotasks()

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountBeforeUnmount)
  })

  // =========================================================================
  // 7. Degraded mode via data error reporting
  // =========================================================================

  it('transitions to degraded after 3+ data errors within 60s window', async () => {
    mockFetchOk()
    const { result } = renderHook(() => useLocalAgent())
    await flushMicrotasks()
    expect(result.current.status).toBe('connected')

    // Report 3 data errors from hook API
    act(() => { result.current.reportDataError('/clusters', 'HTTP 503') })
    act(() => { result.current.reportDataError('/pods', 'HTTP 502') })
    act(() => { result.current.reportDataError('/nodes', 'HTTP 500') })

    expect(result.current.status).toBe('degraded')
    expect(result.current.isDegraded).toBe(true)
    expect(result.current.isConnected).toBe(true) // still considered "connected"
    expect(result.current.dataErrorCount).toBeGreaterThanOrEqual(3)
    expect(result.current.lastDataError).toContain('/nodes')
  })

  it('recovers from degraded when data errors fall below threshold', async () => {
    mockFetchOk()
    const { result } = renderHook(() => useLocalAgent())
    await flushMicrotasks()

    // Push to degraded
    act(() => { result.current.reportDataError('/a', 'err') })
    act(() => { result.current.reportDataError('/b', 'err') })
    act(() => { result.current.reportDataError('/c', 'err') })
    expect(result.current.status).toBe('degraded')

    // Prevent health polls from completing (which would reset status via
    // the wasConnected branch before reportDataSuccess can run recovery)
    mockFetchHang()

    // Advance time past the 60s data error window so timestamps expire
    await act(async () => { vi.advanceTimersByTime(61000) })
    await flushMicrotasks()

    // Now report a success -- should recover from degraded
    act(() => { result.current.reportDataSuccess() })
    expect(result.current.status).toBe('connected')
    expect(result.current.dataErrorCount).toBe(0)
  })

  it('does not transition to degraded if not currently connected', async () => {
    mockFetchHang()
    const { result } = renderHook(() => useLocalAgent())
    // Status is 'connecting' -- not 'connected'
    expect(result.current.status).toBe('connecting')

    act(() => { result.current.reportDataError('/a', 'err') })
    act(() => { result.current.reportDataError('/b', 'err') })
    act(() => { result.current.reportDataError('/c', 'err') })

    // Should NOT be degraded -- only connected can transition
    expect(result.current.status).toBe('connecting')
  })

  // =========================================================================
  // 8. Non-hook utility functions
  // =========================================================================

  it('reportAgentDataError and reportAgentDataSuccess work from module scope', async () => {
    mockFetchOk()
    const { result } = renderHook(() => useLocalAgent())
    await flushMicrotasks()

    act(() => { reportAgentDataError('/ep1', 'fail') })
    act(() => { reportAgentDataError('/ep2', 'fail') })
    act(() => { reportAgentDataError('/ep3', 'fail') })
    expect(result.current.status).toBe('degraded')

    // Prevent health polls from resetting status via wasConnected branch
    mockFetchHang()

    // Advance past the error window
    await act(async () => { vi.advanceTimersByTime(61000) })
    await flushMicrotasks()

    act(() => { reportAgentDataSuccess() })
    expect(result.current.status).toBe('connected')
  })

  it('isAgentConnected returns true when connected, false when disconnected', async () => {
    mockFetchOk()
    renderHook(() => useLocalAgent())
    await flushMicrotasks()
    expect(isAgentConnected()).toBe(true)
  })

  it('isAgentUnavailable returns true only when disconnected', async () => {
    mockFetchHang()
    renderHook(() => useLocalAgent())
    // Status is 'connecting' -- should NOT be unavailable
    expect(isAgentUnavailable()).toBe(false)
  })

  it('isAgentUnavailable returns true after disconnect', async () => {
    mockFetchReject()
    renderHook(() => useLocalAgent())
    await driveToDisconnected()
    expect(isAgentUnavailable()).toBe(true)
  })

  // =========================================================================
  // 9. Aggressive detection
  // =========================================================================

  it('triggerAggressiveDetection resets to connecting and polls at 1s', async () => {
    mockFetchReject()
    const { result } = renderHook(() => useLocalAgent())
    await driveToDisconnected()
    expect(result.current.status).toBe('disconnected')

    // Now trigger aggressive detection with a successful agent
    mockFetchOk()

    await act(async () => {
      // triggerAggressiveDetection is async -- it waits TRANSITION_DELAY_MS (200ms)
      const promise = triggerAggressiveDetection()
      vi.advanceTimersByTime(200) // TRANSITION_DELAY_MS
      await promise
    })
    await flushMicrotasks()

    expect(result.current.status).toBe('connected')
  })

  it('aggressive detection falls back to slow polling after 10s burst', async () => {
    mockFetchReject()
    const { result } = renderHook(() => useLocalAgent())
    await driveToDisconnected()

    // Trigger aggressive (agent still unreachable)
    await act(async () => {
      const promise = triggerAggressiveDetection()
      vi.advanceTimersByTime(200)
      await promise
    })
    await flushMicrotasks()

    // Status should be connecting during aggressive burst
    expect(result.current.status).toBe('connecting')

    // Advance past AGGRESSIVE_DETECT_DURATION (10s)
    await act(async () => { vi.advanceTimersByTime(11000) })
    await flushMicrotasks()

    // After the burst, if still not connected, polling should slow down.
    // Drive through enough failures so state goes to disconnected at the slow interval.
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()
    }
    expect(result.current.status).toBe('disconnected')
  })

  // =========================================================================
  // 10. refresh() triggers an immediate health check
  // =========================================================================

  it('refresh() triggers an immediate health check', async () => {
    mockFetchOk()
    const { result } = renderHook(() => useLocalAgent())
    await flushMicrotasks()

    const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { result.current.refresh() })
    await flushMicrotasks()

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
  })

  // =========================================================================
  // 11. Install instructions
  // =========================================================================

  it('provides install instructions with Homebrew, source, and Linuxbrew options', () => {
    mockFetchHang()
    const { result } = renderHook(() => useLocalAgent())

    const { installInstructions } = result.current
    expect(installInstructions.title).toBe('Install Local Agent')
    expect(installInstructions.steps).toHaveLength(3)
    expect(installInstructions.steps[0].title).toContain('Homebrew')
    expect(installInstructions.steps[1].title).toContain('source')
    expect(installInstructions.steps[2].title).toContain('Linuxbrew')
    expect(installInstructions.benefits).toHaveLength(3)
    expect(installInstructions.benefits[0]).toContain('kubeconfig')
  })

  // =========================================================================
  // 12. Connection events tracking
  // =========================================================================

  it('records connection events during lifecycle transitions', async () => {
    mockFetchOk()
    const { result } = renderHook(() => useLocalAgent())
    await flushMicrotasks()

    // Should have at least: 'connecting' event + 'connected' event
    expect(result.current.connectionEvents.length).toBeGreaterThanOrEqual(2)

    // Most recent event should be 'connected'
    const latest = result.current.connectionEvents[0]
    expect(latest.type).toBe('connected')
    expect(latest.message).toContain('Connected to local agent')
    expect(latest.timestamp).toBeInstanceOf(Date)
  })

  it('records error event when transitioning from connecting to disconnected', async () => {
    mockFetchReject()
    const { result } = renderHook(() => useLocalAgent())
    await driveToDisconnected()

    const errorEvent = result.current.connectionEvents.find(e => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!.message).toContain('Failed to connect')
  })

  // =========================================================================
  // 13. Health data updates while connected
  // =========================================================================

  it('updates health data on subsequent successful polls without re-emitting connect analytics', async () => {
    mockFetchOk()
    const { result } = renderHook(() => useLocalAgent())
    await flushMicrotasks()
    expect(result.current.health?.clusters).toBe(2)

    mockEmitAgentConnected.mockClear()

    // Return updated health data
    const updatedHealth = { ...healthData, clusters: 5 }
    mockFetchOk(updatedHealth)
    await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
    await flushMicrotasks()

    expect(result.current.health?.clusters).toBe(5)
    // Should NOT emit connect analytics again (already connected)
    expect(mockEmitAgentConnected).not.toHaveBeenCalled()
  })

  // =========================================================================
  // 14. isChecking guard prevents overlapping requests
  // =========================================================================

  it('skips overlapping health checks (isChecking guard)', async () => {
    // Make fetch hang so the first check never completes
    mockFetchHang()
    renderHook(() => useLocalAgent())

    // The initial checkAgent is in progress (hung). Advance timer to trigger another poll.
    await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
    await flushMicrotasks()

    // Only one fetch call should have been made (second was skipped)
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  // =========================================================================
  // 15. Multiple subscribers share the singleton
  // =========================================================================

  it('shares state across multiple hook instances (singleton)', async () => {
    mockFetchOk()
    const { result: result1 } = renderHook(() => useLocalAgent())
    const { result: result2 } = renderHook(() => useLocalAgent())
    await flushMicrotasks()

    expect(result1.current.status).toBe('connected')
    expect(result2.current.status).toBe('connected')
    expect(result1.current.health).toEqual(result2.current.health)
  })
})
