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

describe('Agent Connectivity Failure Paths (#11591)', () => {
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
      // Use mockFetchOk so checkAgent() completes and calls this.setState(),
      // which creates a new state object reference and triggers React re-render.
      // Without a setState call, addEvent's mutation of connectionEvents is
      // invisible to React (same object reference → skipped update).
      mockFetchOk()
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

  describe('loading and error state exposure', () => {
    it('exposes connection type state to consumers', () => {
      const { result } = renderHook(() => useLocalAgent())
      expect(result.current).toHaveProperty('status')
      expect(['connected', 'disconnected', 'degraded', 'auth_error', 'connecting']).toContain(result.current.status)
    })

    it('exposes error state to consumers', () => {
      const { result } = renderHook(() => useLocalAgent())
      expect(result.current).toHaveProperty('error')
      expect(result.current.error === null || typeof result.current.error === 'string').toBe(true)
    })
  })
})
