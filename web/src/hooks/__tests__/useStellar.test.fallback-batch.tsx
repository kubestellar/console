/**
 * Tests for useStellar — StellarProvider + useStellar context hook.
 *
 * Strategy:
 * - Mock stellarApi entirely so no network calls happen
 * - Mock EventSource to control SSE event delivery
 * - Render StellarProvider wrapping a consumer component
 * - Test: initial state, SSE events, action approve/reject,
 *         notification ack/dismiss, task CRUD, fallback outside provider
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Mock stellarApi
// ---------------------------------------------------------------------------

const { mockStellarApi } = vi.hoisted(() => ({
  mockStellarApi: {
    getState: vi.fn(),
    getNotifications: vi.fn(),
    getActions: vi.fn(),
    getTasks: vi.fn(),
    getWatches: vi.fn(),
    listSolves: vi.fn(),
    listActivity: vi.fn(),
    acknowledgeNotification: vi.fn(),
    investigateNotification: vi.fn(),
    resolveNotification: vi.fn(),
    dismissNotification: vi.fn(),
    approveAction: vi.fn(),
    rejectAction: vi.fn(),
    updateTaskStatus: vi.fn(),
    createTask: vi.fn(),
    resolveWatch: vi.fn(),
    dismissWatch: vi.fn(),
    snoozeWatch: vi.fn(),
    startSolve: vi.fn(),
  },
}))

vi.mock('../../services/stellar', () => ({
  stellarApi: mockStellarApi,
}))

// ---------------------------------------------------------------------------
// Mock EventSource
// ---------------------------------------------------------------------------

type EventSourceListeners = Record<string, EventListener[]>

interface MockEventSource {
  onopen: ((e: Event) => void) | null
  onerror: ((e: Event) => void) | null
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  readyState: number
  _listeners: EventSourceListeners
  _triggerOpen: () => void
  _triggerError: () => void
  _triggerEvent: (name: string, data: unknown) => void
}

let eventSourceInstances: MockEventSource[] = []

function createMockEventSource(): MockEventSource {
  const listeners: EventSourceListeners = {}
  const es: MockEventSource = {
    onopen: null,
    onerror: null,
    readyState: 0,
    close: vi.fn(),
    addEventListener: vi.fn().mockImplementation((event: string, handler: EventListener) => {
      listeners[event] = listeners[event] || []
      listeners[event].push(handler)
    }),
    removeEventListener: vi.fn().mockImplementation((event: string, handler: EventListener) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler)
      }
    }),
    _listeners: listeners,
    _triggerOpen() {
      this.readyState = 1
      this.onopen?.(new Event('open'))
    },
    _triggerError() {
      this.readyState = 2
      this.onerror?.(new Event('error'))
    },
    _triggerEvent(name: string, data: unknown) {
      const handlers = listeners[name] || []
      handlers.forEach(h => h(new MessageEvent(name, { data: JSON.stringify(data) })))
    },
  }
  return es
}

// ---------------------------------------------------------------------------
// Mock localStorage / cookies for token wait
// ---------------------------------------------------------------------------

beforeEach(() => {
  eventSourceInstances = []
  vi.useRealTimers()

  const mockEventSource = vi.fn(function(this: unknown) {
    const es = createMockEventSource()
    eventSourceInstances.push(es)
    return es
  })

  vi.stubGlobal('EventSource', mockEventSource)
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'mock-random-uuid') })

  // Set token so SSE connects immediately (avoids 3s wait-for-token loop)
  localStorage.setItem('token', 'test-token')

  // Default API responses — empty/minimal
  mockStellarApi.getState.mockResolvedValue({
    clustersWatching: [],
    unreadCount: 0,
    pendingActionCount: 0,
  })
  mockStellarApi.getNotifications.mockResolvedValue([])
  mockStellarApi.getActions.mockResolvedValue([])
  mockStellarApi.getTasks.mockResolvedValue([])
  mockStellarApi.getWatches.mockResolvedValue([])
  mockStellarApi.listSolves.mockResolvedValue([])
  mockStellarApi.listActivity.mockResolvedValue([])
  mockStellarApi.acknowledgeNotification.mockResolvedValue(undefined)
  mockStellarApi.investigateNotification.mockResolvedValue({ id: 'n1', status: 'investigating' })
  mockStellarApi.resolveNotification.mockResolvedValue({ id: 'n1', status: 'resolved' })
  mockStellarApi.dismissNotification.mockResolvedValue({ id: 'n1', status: 'dismissed' })
  mockStellarApi.approveAction.mockResolvedValue({ id: 'a1', status: 'approved' })
  mockStellarApi.rejectAction.mockResolvedValue({ id: 'a1', status: 'rejected' })
  mockStellarApi.updateTaskStatus.mockResolvedValue(undefined)
  mockStellarApi.createTask.mockResolvedValue({ id: 't1', title: 'New Task', priority: 5 })
  mockStellarApi.resolveWatch.mockResolvedValue(undefined)
  mockStellarApi.dismissWatch.mockResolvedValue(undefined)
  mockStellarApi.snoozeWatch.mockResolvedValue(undefined)
  mockStellarApi.startSolve.mockResolvedValue({ solveId: 's1', status: 'running' })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  eventSourceInstances.forEach(es => {
    Object.keys(es._listeners).forEach(eventName => {
      es._listeners[eventName] = []
    })
  })
  eventSourceInstances = []
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Import subject after mocks
// ---------------------------------------------------------------------------

import {
  StellarProvider,
  STELLAR_MISSION_TRIGGER_EVENT,
  STELLAR_TOKEN_POLL_INTERVAL_MS,
  STELLAR_TOKEN_POLL_MAX_ATTEMPTS,
  useStellar,
} from '../useStellar'
import {
  STELLAR_BATCH_INTERVAL_FIFTEEN_MINUTES_MS,
  STELLAR_BATCH_INTERVAL_TWO_HOURS_MS,
  STELLAR_DEFAULT_BATCH_INTERVAL_MS,
} from '../../components/stellar/lib/time'
import { STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS } from '../../lib/constants/storage'

// ---------------------------------------------------------------------------
// Helper: render a consumer inside StellarProvider
// ---------------------------------------------------------------------------

function renderWithProvider() {
  const capturedRef: { current: ReturnType<typeof useStellar> | null } = { current: null }
  function Consumer() {
    capturedRef.current = useStellar()
    return null
  }
  const { unmount } = render(
    <StellarProvider>
      <Consumer />
    </StellarProvider>
  )
  return { capturedRef, unmount }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useStellar — fallback outside provider', () => {
  it('returns zeroed state when called outside StellarProvider', () => {
    const { result } = renderHook(() => useStellar())
    expect(result.current.isConnected).toBe(false)
    expect(result.current.notifications).toEqual([])
    expect(result.current.pendingActions).toEqual([])
    expect(result.current.tasks).toEqual([])
    expect(result.current.watches).toEqual([])
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.state).toBeNull()
    expect(result.current.nudge).toBeNull()
    expect(result.current.catchUp).toBeNull()
    expect(result.current.batchIntervalMs).toBe(STELLAR_DEFAULT_BATCH_INTERVAL_MS)
    expect(result.current.isBatchRefreshing).toBe(false)
  })

  it('fallback action handlers are callable without throwing', async () => {
    const { result } = renderHook(() => useStellar())
    await expect(result.current.acknowledgeNotification('x')).resolves.toBeUndefined()
    await expect(result.current.dismissAllNotifications()).resolves.toBeUndefined()
    await expect(result.current.approveAction('x')).resolves.toBeUndefined()
    await expect(result.current.rejectAction('x', 'reason')).resolves.toBeUndefined()
    await expect(result.current.updateTaskStatus('x', 'done')).resolves.toBeUndefined()
    await expect(result.current.refreshState()).resolves.toBeUndefined()
    expect(() => result.current.dismissNudge()).not.toThrow()
    expect(() => result.current.dismissCatchUp()).not.toThrow()
    expect(() => result.current.setProviderSession(null)).not.toThrow()
  })

  it('fallback solves/solveProgress are empty', () => {
    const { result } = renderHook(() => useStellar())
    expect(result.current.solves).toEqual([])
    expect(result.current.solveProgress).toEqual({})
    expect(result.current.activity).toEqual([])
  })
})


describe('StellarProvider — initial state', () => {
  it('renders children without throwing', async () => {
    await act(async () => {
      render(
        <StellarProvider>
          <span data-testid="child">hello</span>
        </StellarProvider>
      )
    })
    expect(screen.getByTestId('child')).toBeTruthy()
  })

  it('starts with isConnected false before SSE opens', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    // SSE not yet opened — isConnected false
    expect(capturedRef.current?.isConnected).toBe(false)
  })

  it('sets isConnected true after SSE open event', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    await act(async () => { es._triggerOpen() })
    expect(capturedRef.current?.isConnected).toBe(true)
  })

  it('calls refreshState on mount', async () => {
    renderWithProvider()
    await act(async () => { await Promise.resolve() })
    expect(mockStellarApi.getState).toHaveBeenCalled()
    expect(mockStellarApi.getNotifications).toHaveBeenCalled()
    expect(mockStellarApi.getTasks).toHaveBeenCalled()
  })
})


describe('StellarProvider — batch scheduling', () => {
  it('loads the stored batch interval preference', async () => {
    localStorage.setItem(STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS, String(STELLAR_BATCH_INTERVAL_TWO_HOURS_MS))

    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })

    expect(capturedRef.current?.batchIntervalMs).toBe(STELLAR_BATCH_INTERVAL_TWO_HOURS_MS)
  })

  it('persists batch interval changes and resets the next batch time', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })

    const previousNextBatchAtMs = capturedRef.current?.nextBatchAtMs ?? 0

    await act(async () => {
      capturedRef.current?.setBatchIntervalMs(STELLAR_BATCH_INTERVAL_TWO_HOURS_MS)
    })

    expect(localStorage.getItem(STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS)).toBe(String(STELLAR_BATCH_INTERVAL_TWO_HOURS_MS))
    expect(capturedRef.current?.batchIntervalMs).toBe(STELLAR_BATCH_INTERVAL_TWO_HOURS_MS)
    expect((capturedRef.current?.nextBatchAtMs ?? 0)).toBeGreaterThan(previousNextBatchAtMs)
  })

  it('automatically refreshes when the configured batch interval elapses', async () => {
    vi.useFakeTimers()
    try {
      localStorage.setItem(STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS, String(STELLAR_BATCH_INTERVAL_FIFTEEN_MINUTES_MS))

      renderWithProvider()
      await act(async () => { await Promise.resolve() })

      mockStellarApi.getState.mockClear()
      mockStellarApi.getNotifications.mockClear()

      await act(async () => {
        vi.advanceTimersByTime(STELLAR_BATCH_INTERVAL_FIFTEEN_MINUTES_MS)
        await Promise.resolve()
      })

      expect(mockStellarApi.getState).toHaveBeenCalledTimes(1)
      expect(mockStellarApi.getNotifications).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('runs a batch immediately when requested', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })

    mockStellarApi.getState.mockClear()
    mockStellarApi.getNotifications.mockClear()

    await act(async () => {
      await capturedRef.current?.runBatchNow()
    })

    expect(mockStellarApi.getState).toHaveBeenCalledTimes(1)
    expect(mockStellarApi.getNotifications).toHaveBeenCalledTimes(1)
  })
})


