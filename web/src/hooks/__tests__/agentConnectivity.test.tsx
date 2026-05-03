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

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

// Dynamically imported after each module reset
let useLocalAgent: typeof import('../useLocalAgent').useLocalAgent
let reportAgentDataError: typeof import('../useLocalAgent').reportAgentDataError
let reportAgentDataSuccess: typeof import('../useLocalAgent').reportAgentDataSuccess
let isAgentConnected: typeof import('../useLocalAgent').isAgentConnected
let isAgentUnavailable: typeof import('../useLocalAgent').isAgentUnavailable
let wasAgentEverConnected: typeof import('../useLocalAgent').wasAgentEverConnected
let triggerAggressiveDetection: typeof import('../useLocalAgent').triggerAggressiveDetection

const POLL_INTERVAL = 10_000
const DISCONNECTED_POLL_INTERVAL = 60_000
const FAILURE_THRESHOLD = 9

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

/** Drive agent to disconnected by exhausting the failure threshold. */
async function driveToDisconnected() {
  mockFetchReject()
  await flushMicrotasks()
  for (let i = 1; i < FAILURE_THRESHOLD; i++) {
    await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
    await flushMicrotasks()
  }
}

describe('Agent Connectivity Failure Paths (#11591)', () => {
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

  describe('connection refused (agent not running)', () => {
    it('produces "Local agent not available" error after threshold', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()

      expect(result.current.error).toBe('Local agent not available')
      expect(result.current.status).toBe('disconnected')
    })

    it('falls back to demo health data when disconnected', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()

      expect(result.current.health).not.toBeNull()
      expect(result.current.health?.status).toBe('demo')
      expect(result.current.health?.version).toBe('demo')
    })

    it('sets isDemoMode=true when fully disconnected', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()

      expect(result.current.isDemoMode).toBe(true)
    })

    it('isAgentUnavailable() returns true when disconnected', async () => {
      renderHook(() => useLocalAgent())
      await driveToDisconnected()

      expect(isAgentUnavailable()).toBe(true)
    })

    it('isAgentConnected() returns false when disconnected', async () => {
      renderHook(() => useLocalAgent())
      await driveToDisconnected()

      expect(isAgentConnected()).toBe(false)
    })

    it('records disconnection event in connectionEvents', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()

      const events = result.current.connectionEvents
      const errorEvents = events.filter(e => e.type === 'error' || e.type === 'disconnected')
      expect(errorEvents.length).toBeGreaterThan(0)
      // The message should be actionable (mentions agent or connection)
      const lastError = errorEvents[0]
      expect(lastError.message).toMatch(/agent|connect/i)
    })
  })

  // ===========================================================================
  // HTTP Error Status Scenarios
  // ===========================================================================

  describe('HTTP error statuses from agent health endpoint', () => {
    it.each([
      [502, 'Bad Gateway'],
      [503, 'Service Unavailable'],
      [504, 'Gateway Timeout'],
      [500, 'Internal Server Error'],
    ])('HTTP %i → disconnected after threshold', async (status: number) => {
      mockFetchStatus(status)
      const { result } = renderHook(() => useLocalAgent())

      await flushMicrotasks()
      for (let i = 1; i < FAILURE_THRESHOLD; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }

      expect(result.current.status).toBe('disconnected')
      expect(result.current.error).toBe('Local agent not available')
    })

    it('HTTP 401 from agent is treated as a failure', async () => {
      mockFetchStatus(401)
      const { result } = renderHook(() => useLocalAgent())

      await flushMicrotasks()
      for (let i = 1; i < FAILURE_THRESHOLD; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }

      expect(result.current.status).toBe('disconnected')
    })
  })

  // ===========================================================================
  // Timeout Scenarios
  // ===========================================================================

  describe('timeout (agent unreachable / slow response)', () => {
    it('hangs do not mark as connected', async () => {
      mockFetchHang()
      const { result } = renderHook(() => useLocalAgent())

      // Advance well past polling intervals
      await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL * 3) })
      await flushMicrotasks()

      // Still connecting because fetch never resolves or rejects
      expect(result.current.status).toBe('connecting')
      expect(result.current.isConnected).toBe(false)
    })

    it('AbortError from timeout is treated as failure', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError')
      ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(abortError)

      const { result } = renderHook(() => useLocalAgent())

      await flushMicrotasks()
      for (let i = 1; i < FAILURE_THRESHOLD; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }

      expect(result.current.status).toBe('disconnected')
      expect(result.current.error).toBe('Local agent not available')
    })

    it('TypeError (network failure) is treated as failure', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new TypeError('Failed to fetch')
      )

      const { result } = renderHook(() => useLocalAgent())

      await flushMicrotasks()
      for (let i = 1; i < FAILURE_THRESHOLD; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }

      expect(result.current.status).toBe('disconnected')
    })
  })

  // ===========================================================================
  // Error Message Consistency
  // ===========================================================================

  describe('error message consistency', () => {
    it('connection refused and HTTP errors produce the same error text', async () => {
      // Test connection refused
      mockFetchReject('Connection refused')
      const { result: result1 } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      const errorFromRefused = result1.current.error

      // Reset module for fresh singleton
      vi.resetModules()
      const mod2 = await import('../useLocalAgent')
      useLocalAgent = mod2.useLocalAgent

      // Test HTTP 503
      mockFetchStatus(503)
      const { result: result2 } = renderHook(() => useLocalAgent())
      await flushMicrotasks()
      for (let i = 1; i < FAILURE_THRESHOLD; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }
      const errorFromHttp = result2.current.error

      // Both should produce the same user-facing error
      expect(errorFromRefused).toBe('Local agent not available')
      expect(errorFromHttp).toBe('Local agent not available')
      expect(errorFromRefused).toBe(errorFromHttp)
    })

    it('error is cleared on successful reconnection', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      expect(result.current.error).toBe('Local agent not available')

      // Reconnect with hysteresis (2 successes)
      mockFetchOk()
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()

      expect(result.current.error).toBeNull()
      expect(result.current.status).toBe('connected')
    })
  })

  // ===========================================================================
  // Reconnection Behavior After Recovery
  // ===========================================================================

  describe('reconnection after agent recovery', () => {
    it('single success does not reconnect (hysteresis)', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      expect(result.current.status).toBe('disconnected')

      mockFetchOk()
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()

      // Still disconnected — needs 2 consecutive successes
      expect(result.current.status).toBe('disconnected')
    })

    it('two consecutive successes reconnect from disconnected', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()

      mockFetchOk()
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()

      expect(result.current.status).toBe('connected')
      expect(result.current.isConnected).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('emits analytics on reconnection', async () => {
      // First connect
      mockFetchOk()
      renderHook(() => useLocalAgent())
      await flushMicrotasks()
      mockEmitAgentConnected.mockClear()

      // Disconnect
      mockFetchReject()
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }

      // Reconnect (2 successes needed)
      mockFetchOk()
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()

      expect(mockEmitAgentConnected).toHaveBeenCalled()
    })

    it('wasAgentEverConnected() returns true after first connection', async () => {
      mockFetchOk()
      renderHook(() => useLocalAgent())
      await flushMicrotasks()

      expect(wasAgentEverConnected()).toBe(true)

      // Disconnect
      mockFetchReject()
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }

      // Still true after disconnect
      expect(wasAgentEverConnected()).toBe(true)
    })

    it('wasAgentEverConnected() returns false if never connected', async () => {
      mockFetchReject()
      renderHook(() => useLocalAgent())
      await driveToDisconnected()

      expect(wasAgentEverConnected()).toBe(false)
    })
  })

  // ===========================================================================
  // Degraded Mode — Health OK but Data Endpoints Failing
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

  describe('aggressive detection on user retry', () => {
    it('resets status to connecting during aggressive detection', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      expect(result.current.status).toBe('disconnected')

      // Trigger aggressive detection — status should reset
      await act(async () => {
        triggerAggressiveDetection()
      })
      await flushMicrotasks()

      // During aggressive detection, status should not be 'disconnected'
      // (it resets to 'connecting')
      expect(isAgentUnavailable()).toBe(false)
    })

    it('aggressive detection fires immediate health check', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

      mockFetchOk()
      await act(async () => {
        triggerAggressiveDetection()
      })
      await flushMicrotasks()

      // Should have fired at least one additional fetch
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
    })

    it('aggressive detection uses 1s polling for burst window', async () => {
      renderHook(() => useLocalAgent())
      await driveToDisconnected()

      mockFetchReject()
      const callsAtStart = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

      await act(async () => {
        triggerAggressiveDetection()
      })
      await flushMicrotasks()
      const callsAfterTrigger = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

      // Advance in 1s increments to allow each checkAgent() to complete before the next fires
      for (let i = 0; i < 3; i++) {
        await act(async () => { vi.advanceTimersByTime(1000) })
        await flushMicrotasks()
      }

      const callsAfter3s = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
      // At least 2 additional checks in 3 seconds (1s interval)
      expect(callsAfter3s - callsAfterTrigger).toBeGreaterThanOrEqual(2)
    })

    it('aggressive detection falls back to slow polling after burst window', async () => {
      renderHook(() => useLocalAgent())
      await driveToDisconnected()

      mockFetchReject()
      await act(async () => {
        triggerAggressiveDetection()
      })
      await flushMicrotasks()

      // Advance past the 10s aggressive window
      await act(async () => { vi.advanceTimersByTime(11_000) })
      await flushMicrotasks()

      const callsAfterBurst = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

      // Advance 10s more — at 60s poll interval, should NOT fire
      await act(async () => { vi.advanceTimersByTime(10_000) })
      await flushMicrotasks()

      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterBurst)
    })
  })

  // ===========================================================================
  // Interleaved Failure Types
  // ===========================================================================

  describe('interleaved failure types', () => {
    it('mixed connection refused and HTTP errors accumulate toward threshold', async () => {
      const { result } = renderHook(() => useLocalAgent())

      // Alternate between connection refused and HTTP errors
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        if (i % 2 === 0) {
          mockFetchReject('Connection refused')
        } else {
          mockFetchStatus(503)
        }
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }

      expect(result.current.status).toBe('disconnected')
    })

    it('a single success resets failure count entirely', async () => {
      const { result } = renderHook(() => useLocalAgent())

      // Accumulate failures just below threshold
      mockFetchReject()
      await flushMicrotasks()
      for (let i = 1; i < FAILURE_THRESHOLD - 1; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }
      expect(result.current.status).not.toBe('disconnected')

      // One success resets
      mockFetchOk()
      await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
      await flushMicrotasks()
      expect(result.current.status).toBe('connected')

      // Now fail again — should need full threshold again
      mockFetchReject()
      for (let i = 0; i < FAILURE_THRESHOLD - 2; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }
      expect(result.current.status).not.toBe('disconnected')
    })
  })

  // ===========================================================================
  // Polling Interval Adaptation
  // ===========================================================================

  describe('polling interval adaptation under failure', () => {
    it('switches to slow polling (60s) when disconnected', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      expect(result.current.status).toBe('disconnected')

      const callsAtDisconnect = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

      // 10s advance should NOT trigger a poll
      await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
      await flushMicrotasks()
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAtDisconnect)

      // 60s advance SHOULD trigger a poll
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL - POLL_INTERVAL) })
      await flushMicrotasks()
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAtDisconnect)
    })

    it('restores fast polling (10s) on reconnection', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()

      // Reconnect (2 successes)
      mockFetchOk()
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()
      expect(result.current.status).toBe('connected')

      const callsAfterReconnect = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

      // 10s advance should trigger a poll (fast interval restored)
      await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
      await flushMicrotasks()
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterReconnect)
    })
  })

  // ===========================================================================
  // Connection Event Log
  // ===========================================================================

  describe('connection event log', () => {
    it('logs connecting event on startup', async () => {
      mockFetchHang()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()

      const events = result.current.connectionEvents
      expect(events.some(e => e.type === 'connecting')).toBe(true)
    })

    it('logs connected event on success', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()

      const events = result.current.connectionEvents
      expect(events.some(e => e.type === 'connected')).toBe(true)
      expect(events.some(e => e.message.includes('Connected to local agent'))).toBe(true)
    })

    it('logs disconnected event on failure from connected state', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()

      mockFetchReject()
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }

      const events = result.current.connectionEvents
      expect(events.some(e => e.type === 'disconnected')).toBe(true)
      expect(events.some(e => e.message.includes('Lost connection'))).toBe(true)
    })

    it('logs error event when connecting and never succeeds', async () => {
      mockFetchReject()
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()

      const events = result.current.connectionEvents
      expect(events.some(e => e.type === 'error')).toBe(true)
      expect(events.some(e => e.message.includes('not available'))).toBe(true)
    })

    it('events have timestamps', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()

      const events = result.current.connectionEvents
      expect(events.length).toBeGreaterThan(0)
      events.forEach(e => {
        expect(e.timestamp).toBeInstanceOf(Date)
      })
    })

    it('limits events to prevent memory growth', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()

      // Generate many state changes to create events
      for (let cycle = 0; cycle < 30; cycle++) {
        mockFetchReject()
        for (let i = 0; i < FAILURE_THRESHOLD; i++) {
          await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
          await flushMicrotasks()
        }
        mockFetchOk()
        await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
        await flushMicrotasks()
        await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
        await flushMicrotasks()
      }

      // Should be capped at maxEvents (50)
      expect(result.current.connectionEvents.length).toBeLessThanOrEqual(50)
    })
  })

  // ===========================================================================
  // Install Instructions
  // ===========================================================================

  describe('install instructions', () => {
    it('provides install instructions when disconnected', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()

      expect(result.current.installInstructions).toBeDefined()
      expect(result.current.installInstructions.title).toBeTruthy()
      expect(result.current.installInstructions.steps.length).toBeGreaterThan(0)
      expect(result.current.installInstructions.benefits.length).toBeGreaterThan(0)
    })

    it('install instructions include actionable commands', async () => {
      mockFetchHang()
      const { result } = renderHook(() => useLocalAgent())

      const { steps } = result.current.installInstructions
      steps.forEach(step => {
        expect(step.title).toBeTruthy()
        expect(step.command).toBeTruthy()
      })
    })
  })
})
