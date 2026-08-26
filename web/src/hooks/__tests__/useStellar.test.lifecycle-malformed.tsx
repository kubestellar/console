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

describe('StellarProvider — SSE lifecycle (#14220)', () => {
  it('creates exactly one EventSource on mount', async () => {
    renderWithProvider()
    await act(async () => { await Promise.resolve() })
    expect(eventSourceInstances).toHaveLength(1)
  })

  it('closes EventSource on unmount', async () => {
    const { unmount } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    unmount()
    expect(es.close).toHaveBeenCalled()
  })

  it('creates one new EventSource after remount', async () => {
    const first = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    first.unmount()
    renderWithProvider()
    await act(async () => { await Promise.resolve() })
    expect(eventSourceInstances).toHaveLength(2)
  })

  it('dispatches stellar:mission_trigger custom event from SSE', async () => {
    const handler = vi.fn()
    window.addEventListener(STELLAR_MISSION_TRIGGER_EVENT, handler)
    try {
      renderWithProvider()
      await act(async () => { await Promise.resolve() })
      const es = eventSourceInstances[0]
      const payload = {
        solveId: 'solve-1',
        eventId: 'evt-1',
        cluster: 'c1',
        namespace: 'ns',
        workload: 'wl',
        reason: 'crash',
        message: 'pod failed',
        title: 'Fix pod',
        prompt: 'repair it',
      }
      await act(async () => {
        es._triggerEvent('mission_trigger', payload)
      })
      expect(handler).toHaveBeenCalledTimes(1)
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual(payload)
    } finally {
      window.removeEventListener(STELLAR_MISSION_TRIGGER_EVENT, handler)
    }
  })

  it('skips init when no auth credentials are present', async () => {
    localStorage.clear()
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    })
    renderWithProvider()
    await act(async () => { await Promise.resolve() })
    expect(eventSourceInstances).toHaveLength(0)
    expect(mockStellarApi.getState).not.toHaveBeenCalled()
  })

  it('clears token poll interval on unmount before poll completes', async () => {
    vi.useFakeTimers()
    try {
      localStorage.clear()
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: '',
      })

      const { unmount } = renderWithProvider()
      await act(async () => { await Promise.resolve() })
      unmount()

      const eventSourceCountAfterUnmount = eventSourceInstances.length
      await act(async () => {
        vi.advanceTimersByTime(STELLAR_TOKEN_POLL_MAX_ATTEMPTS * STELLAR_TOKEN_POLL_INTERVAL_MS)
      })

      expect(mockStellarApi.getState).not.toHaveBeenCalled()
      expect(eventSourceInstances).toHaveLength(eventSourceCountAfterUnmount)
    } finally {
      vi.useRealTimers()
    }
  })
})


describe('StellarProvider — malformed SSE data', () => {
  it('ignores SSE event with malformed JSON (does not throw)', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    const listeners = es._listeners['notification'] || []
    // Send malformed data directly to listener
    await act(async () => {
      listeners.forEach(h => h(new MessageEvent('notification', { data: 'NOT JSON {{{' })))
    })
    // Should not crash; notifications unchanged
    expect(capturedRef.current?.notifications).toHaveLength(0)
  })
})

