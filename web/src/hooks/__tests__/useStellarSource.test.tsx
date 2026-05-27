import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import {
  useStellarSource,
  STELLAR_ACTIVITY_LIMIT,
  STELLAR_RECONNECT_BASE_MS,
  STELLAR_RECONNECT_MAX_MS,
  STELLAR_TOKEN_POLL_INTERVAL_MS,
  STELLAR_TOKEN_POLL_MAX_ATTEMPTS,
  STELLAR_MISSION_TRIGGER_EVENT,
} from '../useStellarSource'
import { STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS } from '../../lib/constants/storage'

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
// Mock localStorage utility
// ---------------------------------------------------------------------------
const mockLocalStorage = {
  safeGetItem: vi.fn((key) => localStorage.getItem(key)),
  safeSetItem: vi.fn((key, value) => localStorage.setItem(key, value)),
}

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: (...args: any[]) => mockLocalStorage.safeGetItem(...args),
  safeSetItem: (...args: any[]) => mockLocalStorage.safeSetItem(...args),
}))

// ---------------------------------------------------------------------------
// Mock EventSource
// ---------------------------------------------------------------------------
let eventSourceInstances: MockEventSource[] = []

class MockEventSource {
  url: string
  options: any
  onopen: ((e: Event) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  readyState: number = 0
  close = vi.fn()
  _listeners: Record<string, EventListener[]> = {}

  constructor(url: string, options?: any) {
    this.url = url
    this.options = options
    eventSourceInstances.push(this)
  }

  addEventListener = vi.fn().mockImplementation((event: string, handler: EventListener) => {
    this._listeners[event] = this._listeners[event] || []
    this._listeners[event].push(handler)
  })

  removeEventListener = vi.fn()

  _triggerOpen() {
    this.readyState = 1
    if (this.onopen) this.onopen(new Event('open'))
  }

  _triggerError() {
    this.readyState = 2
    if (this.onerror) this.onerror(new Event('error'))
  }

  _triggerEvent(name: string, data: unknown) {
    const handlers = this._listeners[name] || []
    handlers.forEach((h) => h(new MessageEvent(name, { data: JSON.stringify(data) })))
  }
}

// ---------------------------------------------------------------------------
// Setup & Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  eventSourceInstances = []
  vi.useRealTimers()

  vi.stubGlobal('EventSource', MockEventSource)
  vi.stubGlobal('crypto', {
    randomUUID: () => 'mock-random-uuid',
  })

  // Default API mocks returning empty data
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
  mockStellarApi.startSolve.mockResolvedValue({ solveId: 's1', status: 'running' })

  // Initialize basic localStorage credentials by default so EventSource connects instantly
  localStorage.setItem('token', 'test-token')
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('useStellarSource — EventSource lifecycle', () => {
  it('connects to EventSource on mount and sets up message handler', async () => {
    renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })
    expect(eventSourceInstances[0].url).toBe('/api/stellar/stream')
  })

  it('closes EventSource on unmount without leaving open handles', async () => {
    const { unmount } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]
    unmount()
    expect(es.close).toHaveBeenCalledTimes(1)
  })

  it('reconnects with exponential backoff after connection error', async () => {
    vi.useFakeTimers()
    renderHook(() => useStellarSource())

    await vi.runOnlyPendingTimersAsync()
    expect(eventSourceInstances).toHaveLength(1)

    const es1 = eventSourceInstances[0]

    await act(async () => {
      es1._triggerError()
    })

    // Reconnect delay starts at STELLAR_RECONNECT_BASE_MS (1000ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STELLAR_RECONNECT_BASE_MS)
    })

    expect(eventSourceInstances).toHaveLength(2)
  })

  it('reconnect delay doubles on repeated failures up to STELLAR_RECONNECT_MAX_MS cap', async () => {
    vi.useFakeTimers()
    renderHook(() => useStellarSource())

    await vi.runOnlyPendingTimersAsync()
    expect(eventSourceInstances).toHaveLength(1)

    // 1st error -> delay base (1000ms)
    await act(async () => { eventSourceInstances[0]._triggerError() })
    await act(async () => { await vi.advanceTimersByTimeAsync(STELLAR_RECONNECT_BASE_MS) })
    expect(eventSourceInstances).toHaveLength(2)

    // 2nd error -> delay doubles to 2000ms
    await act(async () => { eventSourceInstances[1]._triggerError() })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(eventSourceInstances).toHaveLength(2) // not reconnected yet
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(eventSourceInstances).toHaveLength(3) // reconnected at 2000ms total

    // 3rd failure: delay = 4000ms
    await act(async () => { eventSourceInstances[2]._triggerError() })
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(eventSourceInstances).toHaveLength(4)

    // 4th failure: delay = 8000ms
    await act(async () => { eventSourceInstances[3]._triggerError() })
    await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
    expect(eventSourceInstances).toHaveLength(5)

    // 5th failure: delay = 16000ms
    await act(async () => { eventSourceInstances[4]._triggerError() })
    await act(async () => { await vi.advanceTimersByTimeAsync(16000) })
    expect(eventSourceInstances).toHaveLength(6)

    // 6th failure: delay = 32000ms, capped at STELLAR_RECONNECT_MAX_MS (30000ms)
    await act(async () => { eventSourceInstances[5]._triggerError() })
    await act(async () => { await vi.advanceTimersByTimeAsync(STELLAR_RECONNECT_MAX_MS - 1000) })
    expect(eventSourceInstances).toHaveLength(6) // not reconnected yet
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(eventSourceInstances).toHaveLength(7) // capped reconnect happened at 30000ms
  })

  it('resets reconnect delay to base after successful open event', async () => {
    vi.useFakeTimers()
    renderHook(() => useStellarSource())

    await vi.runOnlyPendingTimersAsync()
    expect(eventSourceInstances).toHaveLength(1)

    // Trigger error -> delay becomes 2000ms for next failure
    await act(async () => { eventSourceInstances[0]._triggerError() })
    await act(async () => { await vi.advanceTimersByTimeAsync(STELLAR_RECONNECT_BASE_MS) })
    expect(eventSourceInstances).toHaveLength(2)

    // Trigger open event on new EventSource (successful connection)
    await act(async () => {
      eventSourceInstances[1]._triggerOpen()
    })

    // Trigger error on the new EventSource. Reconnect delay should be back to base (1000ms)
    await act(async () => { eventSourceInstances[1]._triggerError() })
    await act(async () => { await vi.advanceTimersByTimeAsync(STELLAR_RECONNECT_BASE_MS) })
    expect(eventSourceInstances).toHaveLength(3)
  })
})

describe('useStellarSource — Token polling', () => {
  it('waits for auth token before opening EventSource connection', async () => {
    vi.useFakeTimers()
    localStorage.clear()

    let attempts = 0
    const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation((key) => {
      if (key === 'token') {
        attempts++
        if (attempts < STELLAR_TOKEN_POLL_MAX_ATTEMPTS) {
          return null
        }
        return 'valid-token'
      }
      return null
    })

    mockLocalStorage.safeGetItem.mockImplementation((key) => {
      if (key === 'token') {
        if (attempts < STELLAR_TOKEN_POLL_MAX_ATTEMPTS) return null
        return 'valid-token'
      }
      return localStorage.getItem(key)
    })

    renderHook(() => useStellarSource())

    expect(eventSourceInstances).toHaveLength(0)

    // Advance to before the token polling limit
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STELLAR_TOKEN_POLL_INTERVAL_MS * (STELLAR_TOKEN_POLL_MAX_ATTEMPTS - 2))
    })
    expect(eventSourceInstances).toHaveLength(0)

    // Advance to where the token becomes available
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STELLAR_TOKEN_POLL_INTERVAL_MS * 2)
    })

    expect(eventSourceInstances).toHaveLength(1)
    getItemSpy.mockRestore()
  })

  it('gives up polling after STELLAR_TOKEN_POLL_MAX_ATTEMPTS and does not open EventSource', async () => {
    vi.useFakeTimers()
    localStorage.clear()

    const getItemSpy = vi.spyOn(localStorage, 'getItem').mockReturnValue(null)
    mockLocalStorage.safeGetItem.mockReturnValue(null)

    renderHook(() => useStellarSource())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STELLAR_TOKEN_POLL_INTERVAL_MS * (STELLAR_TOKEN_POLL_MAX_ATTEMPTS + 5))
    })

    expect(eventSourceInstances).toHaveLength(0)
    getItemSpy.mockRestore()
  })
})

describe('useStellarSource — Initial state and SSE messages', () => {
  it('returns empty notifications, activities, solves array on initial render', () => {
    const { result } = renderHook(() => useStellarSource())
    expect(result.current.notifications).toEqual([])
    expect(result.current.activity).toEqual([])
    expect(result.current.solves).toEqual([])
  })

  it('parses incoming SSE notification event and appends to state', async () => {
    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]
    const mockNotif = {
      id: 'n-123',
      type: 'event',
      severity: 'info',
      title: 'Alert!',
      body: 'Everything is fine',
      read: false,
      createdAt: new Date().toISOString(),
    }

    await act(async () => {
      es._triggerEvent('notification', mockNotif)
    })

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].id).toBe('n-123')
  })

  it('parses incoming SSE activity event and appends to state up to STELLAR_ACTIVITY_LIMIT', async () => {
    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]
    const act1 = { id: 'act-1', userId: 'user', ts: new Date().toISOString(), kind: 'test', title: 'Action 1', detail: '', severity: 'info' }
    const act2 = { id: 'act-2', userId: 'user', ts: new Date().toISOString(), kind: 'test', title: 'Action 2', detail: '', severity: 'info' }

    await act(async () => {
      es._triggerEvent('activity', act1)
      es._triggerEvent('activity', act2)
    })

    expect(result.current.activity).toHaveLength(2)
    expect(result.current.activity[0].id).toBe('act-2')
  })

  it('trims activity list to STELLAR_ACTIVITY_LIMIT when limit is exceeded', async () => {
    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]

    await act(async () => {
      for (let i = 0; i < STELLAR_ACTIVITY_LIMIT + 5; i++) {
        es._triggerEvent('activity', {
          id: `act-${i}`,
          userId: 'user',
          ts: new Date().toISOString(),
          kind: 'test',
          title: `Action ${i}`,
          detail: '',
          severity: 'info',
        })
      }
    })

    expect(result.current.activity).toHaveLength(STELLAR_ACTIVITY_LIMIT)
    expect(result.current.activity[0].id).toBe(`act-${STELLAR_ACTIVITY_LIMIT + 4}`)
  })
})

describe('useStellarSource — Optimistic mutations', () => {
  it('acknowledgeNotification optimistically marks notification as read before API resolves', async () => {
    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]
    const mockNotif = {
      id: 'n-ack',
      type: 'event',
      severity: 'info',
      title: 'Alert!',
      body: 'Everything is fine',
      read: false,
      createdAt: new Date().toISOString(),
    }

    await act(async () => {
      es._triggerEvent('notification', mockNotif)
    })
    expect(result.current.notifications).toHaveLength(1)

    let resolvePromise: any
    mockStellarApi.acknowledgeNotification.mockImplementation(() => new Promise((resolve) => {
      resolvePromise = resolve
    }))

    let ackPromise: any
    await act(async () => {
      ackPromise = result.current.acknowledgeNotification('n-ack')
    })

    // Optimistically filtered out/removed from notification list
    expect(result.current.notifications).toHaveLength(0)

    await act(async () => {
      resolvePromise()
      await ackPromise
    })

    expect(result.current.notifications).toHaveLength(0)
  })

  it('acknowledgeNotification rolls back optimistic update on API failure', async () => {
    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]
    const mockNotif = {
      id: 'n-ack-fail',
      type: 'event',
      severity: 'info',
      title: 'Alert!',
      body: 'Everything is fine',
      read: false,
      createdAt: new Date().toISOString(),
    }

    await act(async () => {
      es._triggerEvent('notification', mockNotif)
    })

    mockStellarApi.acknowledgeNotification.mockRejectedValueOnce(new Error('API Failure'))

    await act(async () => {
      try {
        await result.current.acknowledgeNotification('n-ack-fail')
      } catch (e) {
        // expected failure
      }
    })

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].id).toBe('n-ack-fail')
  })

  it('resolveNotification optimistically updates status then confirms on success', async () => {
    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]
    const mockNotif = {
      id: 'n-resolve',
      type: 'event',
      severity: 'info',
      title: 'Alert!',
      body: 'Everything is fine',
      read: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    }

    await act(async () => {
      es._triggerEvent('notification', mockNotif)
    })
    expect(result.current.notifications).toHaveLength(1)

    mockStellarApi.resolveNotification.mockResolvedValueOnce({
      ...mockNotif,
      status: 'resolved',
    })

    await act(async () => {
      await result.current.resolveNotification('n-resolve', 'Notes')
    })

    expect(result.current.notifications).toHaveLength(0) // Resolved is hidden from list
  })

  it('resolveNotification rolls back to previous status on API failure', async () => {
    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]
    const mockNotif = {
      id: 'n-resolve-fail',
      type: 'event',
      severity: 'info',
      title: 'Alert!',
      body: 'Everything is fine',
      read: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    }

    await act(async () => {
      es._triggerEvent('notification', mockNotif)
    })

    mockStellarApi.resolveNotification.mockRejectedValueOnce(new Error('API Failure'))

    await act(async () => {
      try {
        await result.current.resolveNotification('n-resolve-fail', 'Notes')
      } catch (e) {
        // expected failure
      }
    })

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].id).toBe('n-resolve-fail')
  })

  it('investigateNotification optimistically updates status then confirms on success', async () => {
    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]
    const mockNotif = {
      id: 'n-investigate',
      type: 'event',
      severity: 'info',
      title: 'Alert!',
      body: 'Everything is fine',
      read: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    }

    await act(async () => {
      es._triggerEvent('notification', mockNotif)
    })
    expect(result.current.notifications).toHaveLength(1)

    mockStellarApi.investigateNotification.mockResolvedValueOnce({
      ...mockNotif,
      status: 'investigating',
      investigationSummary: 'Investigating details',
    })

    await act(async () => {
      await result.current.investigateNotification('n-investigate', 'Investigating details')
    })

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].status).toBe('investigating')
    expect(result.current.notifications[0].investigationSummary).toBe('Investigating details')
  })

  it('dismissNotification removes notification from list optimistically', async () => {
    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]
    const mockNotif = {
      id: 'n-dismiss',
      type: 'event',
      severity: 'info',
      title: 'Alert!',
      body: 'Everything is fine',
      read: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    }

    await act(async () => {
      es._triggerEvent('notification', mockNotif)
    })
    expect(result.current.notifications).toHaveLength(1)

    mockStellarApi.dismissNotification.mockResolvedValueOnce({
      ...mockNotif,
      status: 'dismissed',
    })

    await act(async () => {
      await result.current.dismissNotification('n-dismiss', 'Not relevant')
    })

    expect(result.current.notifications).toHaveLength(0) // Dismissed is filtered out
  })

  it('dismissNotification restores notification on API failure', async () => {
    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]
    const mockNotif = {
      id: 'n-dismiss-fail',
      type: 'event',
      severity: 'info',
      title: 'Alert!',
      body: 'Everything is fine',
      read: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    }

    await act(async () => {
      es._triggerEvent('notification', mockNotif)
    })

    mockStellarApi.dismissNotification.mockRejectedValueOnce(new Error('API Failure'))

    await act(async () => {
      try {
        await result.current.dismissNotification('n-dismiss-fail', 'Not relevant')
      } catch (e) {
        // expected failure
      }
    })

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].id).toBe('n-dismiss-fail')
  })
})

describe('useStellarSource — Batch refresh', () => {
  it('schedules a batch refresh using getNextBatchTime from localStorage interval', async () => {
    vi.useFakeTimers()
    localStorage.setItem(STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS, '900000') // 15 mins

    mockLocalStorage.safeGetItem.mockReturnValue('900000')

    const { result } = renderHook(() => useStellarSource())

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.batchIntervalMs).toBe(900000)
    expect(result.current.nextBatchAtMs).toBeGreaterThan(Date.now())
  })

  it('persists batch interval to localStorage via safeSetItem', async () => {
    const { result } = renderHook(() => useStellarSource())

    await act(async () => {
      result.current.setBatchIntervalMs(1800000) // 30 mins
    })

    expect(mockLocalStorage.safeSetItem).toHaveBeenCalledWith(STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS, '1800000')
    expect(result.current.batchIntervalMs).toBe(1800000)
  })

  it('clears batch refresh timer on unmount', async () => {
    vi.useFakeTimers()
    const spyClearTimeout = vi.spyOn(globalThis, 'clearTimeout')

    const { unmount } = renderHook(() => useStellarSource())

    await vi.runOnlyPendingTimersAsync()

    unmount()

    expect(spyClearTimeout).toHaveBeenCalled()
    spyClearTimeout.mockRestore()
  })
})

describe('useStellarSource — Auto-solve trigger', () => {
  it('dispatches STELLAR_MISSION_TRIGGER_EVENT custom event when a critical notification arrives with solvable=true', async () => {
    const handler = vi.fn()
    window.addEventListener(STELLAR_MISSION_TRIGGER_EVENT, handler)

    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]
    const payload = {
      solveId: 'solve-123',
      eventId: 'event-123',
      cluster: 'c-1',
      namespace: 'ns-1',
      workload: 'w-1',
      reason: 'CrashLoopBackOff',
      message: 'Pod keeps restarting',
      title: 'Fix Pod',
      prompt: 'Repair it',
    }

    await act(async () => {
      es._triggerEvent('mission_trigger', payload)
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual(payload)

    window.removeEventListener(STELLAR_MISSION_TRIGGER_EVENT, handler)
  })

  it('triggers startSolve for critical event notifications but not for non-critical ones', async () => {
    const { result } = renderHook(() => useStellarSource())

    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })

    const es = eventSourceInstances[0]

    mockStellarApi.startSolve.mockResolvedValueOnce({ solveId: 'solve-999', status: 'running' })

    // Trigger critical notification
    await act(async () => {
      es._triggerEvent('notification', {
        id: 'n-critical',
        type: 'event',
        severity: 'critical',
        title: 'Critical Alert',
        body: 'Emergency!',
        read: false,
        createdAt: new Date().toISOString(),
      })
    })

    expect(mockStellarApi.startSolve).toHaveBeenCalledWith('n-critical')
    expect(result.current.solveProgress['n-critical']).toBeDefined()
    expect(result.current.solveProgress['n-critical'].status).toBe('running')

    mockStellarApi.startSolve.mockClear()

    // Trigger non-critical notification
    await act(async () => {
      es._triggerEvent('notification', {
        id: 'n-warning',
        type: 'event',
        severity: 'warning',
        title: 'Warning Alert',
        body: 'Check this',
        read: false,
        createdAt: new Date().toISOString(),
      })
    })

    expect(mockStellarApi.startSolve).not.toHaveBeenCalled()
    expect(result.current.solveProgress['n-warning']).toBeUndefined()
  })
})
