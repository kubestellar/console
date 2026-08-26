import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  useStellarSource,
  STELLAR_MISSION_TRIGGER_EVENT,
} from '../useStellarSource'
import { STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS } from '../../lib/constants/storage'
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
const mockLocalStorage = {
  safeGetItem: vi.fn((key) => localStorage.getItem(key)),
  safeSetItem: vi.fn((key, value) => localStorage.setItem(key, value)),
}
vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: (...args: unknown[]) => mockLocalStorage.safeGetItem(...args),
  safeSetItem: (...args: unknown[]) => mockLocalStorage.safeSetItem(...args),
}))
let eventSourceInstances: MockEventSource[] = []
class MockEventSource {
  url: string
  options: EventSourceInit | undefined
  onopen: ((e: Event) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  readyState: number = 0
  close = vi.fn()
  _listeners: Record<string, EventListener[]> = {}
  constructor(url: string, options?: EventSourceInit) {
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
beforeEach(() => {
  eventSourceInstances = []
  vi.useRealTimers()
  vi.stubGlobal('EventSource', MockEventSource)
  vi.stubGlobal('crypto', {
    randomUUID: () => 'mock-random-uuid',
  })
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
  localStorage.setItem('token', 'test-token')
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
  vi.restoreAllMocks()
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
    let resolvePromise: ((value: unknown) => void) | undefined
    mockStellarApi.acknowledgeNotification.mockImplementation(() => new Promise((resolve) => {
      resolvePromise = resolve
    }))
    let ackPromise: Promise<void> | undefined
    await act(async () => {
      ackPromise = result.current.acknowledgeNotification('n-ack')
    })
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
      } catch {
        /* intentionally empty */
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
      } catch {
        /* intentionally empty */
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
      } catch {
        /* intentionally empty */
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
  it('stores an error message when a batch refresh request fails', async () => {
    const { result } = renderHook(() => useStellarSource())
    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })
    mockStellarApi.getNotifications.mockRejectedValueOnce(new Error('Batch refresh failed'))
    await act(async () => {
      await result.current.runBatchNow()
    })
    expect(result.current.connectionError).toBe('Batch refresh failed')
  })
})
describe('useStellarSource — Auto-solve trigger', () => {
  it('dispatches STELLAR_MISSION_TRIGGER_EVENT custom event when a critical notification arrives with solvable=true', async () => {
    const handler = vi.fn()
    window.addEventListener(STELLAR_MISSION_TRIGGER_EVENT, handler)
    renderHook(() => useStellarSource())
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
  it('stores an error message when auto-solve fails for a critical notification', async () => {
    const { result } = renderHook(() => useStellarSource())
    await waitFor(() => {
      expect(eventSourceInstances).toHaveLength(1)
    })
    mockStellarApi.startSolve.mockRejectedValueOnce(new Error('Auto-solve failed'))
    await act(async () => {
      eventSourceInstances[0]._triggerEvent('notification', {
        id: 'n-critical-fail',
        type: 'event',
        severity: 'critical',
        title: 'Critical Alert',
        body: 'Emergency!',
        read: false,
        createdAt: new Date().toISOString(),
      })
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.connectionError).toBe('Auto-solve failed')
    })
    expect(result.current.solveProgress['n-critical-fail']).toBeUndefined()
  })
})
