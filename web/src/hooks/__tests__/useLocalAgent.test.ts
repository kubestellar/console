/**
 * Tests for useLocalAgent hook.
 *
 * Validates agent connection lifecycle: initial state, polling,
 * connected/disconnected transitions, and cleanup on unmount.
 *
 * The hook uses a singleton AgentManager with subscribe/unsubscribe.
 * We re-import the module for each test to get a fresh singleton.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before module import
// ---------------------------------------------------------------------------

// Mock isDemoModeForced to false so the agent manager starts normally
vi.mock('../../hooks/useDemoMode', () => ({
  isDemoModeForced: false,
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => false,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
}))

vi.mock('../../lib/analytics', () => ({
  emitAgentConnected: vi.fn(),
  emitAgentDisconnected: vi.fn(),
  emitAgentProvidersDetected: vi.fn(),
  emitConversionStep: vi.fn(),
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

// We need to dynamically import the hook after each module reset
let useLocalAgent: typeof import('../useLocalAgent').useLocalAgent

/** Flush microtask queue so async handlers (fetch, promises) settle. */
async function flushMicrotasks() {
  await act(async () => {
    // Multiple flushes needed for chained promises (fetch -> .json())
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useLocalAgent', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()

    // Set up fresh global fetch mock before importing
    global.fetch = vi.fn()

    const mod = await import('../useLocalAgent')
    useLocalAgent = mod.useLocalAgent
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── Initial state ──────────────────────────────────────────────────────

  it('returns connecting status initially before any health check resolves', () => {
    // Make fetch hang (never resolves)
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    )

    const { result } = renderHook(() => useLocalAgent())

    expect(result.current.status).toBe('connecting')
    expect(result.current.isConnected).toBe(false)
    expect(result.current.isDemoMode).toBe(false)
    expect(result.current.health).toBeNull()
  })

  it('returns the expected API shape', () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    )

    const { result } = renderHook(() => useLocalAgent())

    expect(result.current).toHaveProperty('status')
    expect(result.current).toHaveProperty('health')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('connectionEvents')
    expect(result.current).toHaveProperty('isConnected')
    expect(result.current).toHaveProperty('isDegraded')
    expect(result.current).toHaveProperty('isDemoMode')
    expect(result.current).toHaveProperty('installInstructions')
    expect(result.current).toHaveProperty('refresh')
    expect(result.current).toHaveProperty('reportDataError')
    expect(result.current).toHaveProperty('reportDataSuccess')
    expect(typeof result.current.refresh).toBe('function')
  })

  // ── Transitions to connected on successful health check ────────────────

  it('transitions to connected on successful health check', async () => {
    const healthData = {
      status: 'ok',
      version: '1.2.3',
      clusters: 2,
      hasClaude: true,
    }

    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthData),
    })

    const { result } = renderHook(() => useLocalAgent())

    // The initial checkAgent fires immediately on subscribe;
    // flush microtasks to let the fetch resolve
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

  // ── Transitions to disconnected after enough failures ──────────────────

  it('transitions to disconnected after 9 consecutive failures', async () => {
    const FAILURE_THRESHOLD = 9
    const POLL_INTERVAL = 10000

    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Connection refused')
    )

    const { result } = renderHook(() => useLocalAgent())

    // The first check fires immediately on subscribe.
    // Flush to let it fail, then advance timers for each subsequent poll.
    await flushMicrotasks()

    for (let i = 1; i < FAILURE_THRESHOLD; i++) {
      await act(async () => {
        vi.advanceTimersByTime(POLL_INTERVAL)
      })
      await flushMicrotasks()
    }

    expect(result.current.status).toBe('disconnected')
    expect(result.current.isDemoMode).toBe(true)
    expect(result.current.isConnected).toBe(false)
    expect(result.current.error).toBe('Local agent not available')
  })

  // ── Does not disconnect before failure threshold ───────────────────────

  it('does not disconnect before reaching the failure threshold', async () => {
    const PARTIAL_FAILURES = 5
    const POLL_INTERVAL = 10000

    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Connection refused')
    )

    const { result } = renderHook(() => useLocalAgent())

    // First check fires immediately
    await flushMicrotasks()

    // Advance through fewer than 9 failures
    for (let i = 1; i < PARTIAL_FAILURES; i++) {
      await act(async () => {
        vi.advanceTimersByTime(POLL_INTERVAL)
      })
      await flushMicrotasks()
    }

    // Should still be in connecting state (not disconnected yet)
    expect(result.current.status).not.toBe('disconnected')
  })

  // ── Polls the health endpoint periodically ─────────────────────────────

  it('polls the agent health endpoint at 10s intervals when connected', async () => {
    const POLL_INTERVAL = 10000
    const healthData = {
      status: 'ok',
      version: '1.0.0',
      clusters: 1,
      hasClaude: false,
    }

    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthData),
    })

    renderHook(() => useLocalAgent())

    // Initial call fires immediately
    await flushMicrotasks()

    const initialCallCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    // Advance one poll interval
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL)
    })
    await flushMicrotasks()

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCallCount)
  })

  // ── Cleanup on unmount ─────────────────────────────────────────────────

  it('stops polling when the last subscriber unmounts', async () => {
    const healthData = {
      status: 'ok',
      version: '1.0.0',
      clusters: 1,
      hasClaude: false,
    }

    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthData),
    })

    const { unmount } = renderHook(() => useLocalAgent())

    // Let the initial check run
    await flushMicrotasks()

    const callCountBeforeUnmount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    unmount()

    // Advance well past multiple poll intervals
    const MANY_INTERVALS = 50000
    await act(async () => {
      vi.advanceTimersByTime(MANY_INTERVALS)
    })
    await flushMicrotasks()

    // No additional calls should have been made after unmount
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountBeforeUnmount)
  })

  // ── Install instructions ───────────────────────────────────────────────

  it('provides install instructions with Homebrew and source options', () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    )

    const { result } = renderHook(() => useLocalAgent())

    expect(result.current.installInstructions.title).toBe('Install Local Agent')
    expect(result.current.installInstructions.steps.length).toBeGreaterThanOrEqual(2)
    expect(result.current.installInstructions.benefits.length).toBeGreaterThanOrEqual(1)
  })
})
