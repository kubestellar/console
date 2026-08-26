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
import { render, act, waitFor } from '@testing-library/react'
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
  useStellar,
} from '../useStellar'

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

describe('StellarProvider — SSE events', () => {
  it('handles notification SSE event — adds unread notification', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('notification', {
        id: 'n1',
        type: 'event',
        severity: 'info',
        title: 'Test',
        body: 'body',
        read: false,
        createdAt: new Date().toISOString(),
      })
    })
    expect(capturedRef.current?.notifications.some(n => n.id === 'n1')).toBe(true)
    expect(capturedRef.current?.unreadCount).toBe(1)
  })

  it('ignores notification SSE event if already read', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('notification', {
        id: 'n1',
        type: 'event',
        severity: 'info',
        title: 'Read notif',
        body: 'body',
        read: true,
        createdAt: new Date().toISOString(),
      })
    })
    expect(capturedRef.current?.notifications).toHaveLength(0)
  })

  it('handles state SSE event — updates clustersWatching', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    // Set initial state first via refreshState
    await act(async () => {
      mockStellarApi.getState.mockResolvedValueOnce({ clustersWatching: ['c1'], unreadCount: 0, pendingActionCount: 0 })
      await capturedRef.current?.refreshState()
    })
    await act(async () => {
      es._triggerEvent('state', { clustersWatching: ['c1', 'c2'], unreadCount: 0, pendingActionCount: 0 })
    })
    expect(capturedRef.current?.state?.clustersWatching).toContain('c2')
  })

  it('handles observation SSE event — sets nudge', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('observation', { id: 'obs1', summary: 'CPU spike', suggest: 'scale pods' })
    })
    expect(capturedRef.current?.nudge?.id).toBe('obs1')
    expect(capturedRef.current?.nudge?.summary).toBe('CPU spike')
  })

  it('handles initial_batch SSE event', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    const notif = {
      id: 'nb1',
      type: 'event',
      severity: 'info',
      title: 'Batch notif',
      body: 'body',
      read: false,
      createdAt: new Date().toISOString(),
    }
    await act(async () => {
      es._triggerEvent('initial_batch', {
        notifications: [notif],
        watches: [],
        pendingActions: [],
      })
    })
    expect(capturedRef.current?.notifications.some(n => n.id === 'nb1')).toBe(true)
  })

  it('handles catchup SSE event', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('catchup', {
        summary: 'You missed 3 events',
        kind: 'digest',
        highlights: ['Away for 2h.', '[WARNING] Pod restarted on prod-cluster'],
      })
    })
    expect(capturedRef.current?.catchUp?.summary).toBe('You missed 3 events')
    expect(capturedRef.current?.catchUp?.kind).toBe('digest')
    expect(capturedRef.current?.catchUp?.highlights).toEqual(['Away for 2h.', '[WARNING] Pod restarted on prod-cluster'])
  })

  it('handles action_updated SSE event — removes approved action', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    // Seed a pending action via initial_batch
    await act(async () => {
      es._triggerEvent('initial_batch', {
        pendingActions: [{ id: 'a1', status: 'pending_approval', description: 'Deploy prod' }],
      })
    })
    expect(capturedRef.current?.pendingActions.some(a => a.id === 'a1')).toBe(true)
    // Now action_updated removes it
    await act(async () => {
      es._triggerEvent('action_updated', { id: 'a1', status: 'approved' })
    })
    expect(capturedRef.current?.pendingActions.some(a => a.id === 'a1')).toBe(false)
  })

  it('handles watches SSE event — replaces watch list', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('watches', [
        { id: 'w1', cluster: 'c1', query: 'pod crashed', status: 'active', createdAt: new Date().toISOString() },
      ])
    })
    expect(capturedRef.current?.watches.some(w => w.id === 'w1')).toBe(true)
  })

  it('handles solve_started SSE event — adds in-progress solve', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('solve_started', { solveId: 's1', eventId: 'e1' })
    })
    expect(capturedRef.current?.solveProgress['e1']).toBeDefined()
    expect(capturedRef.current?.solveProgress['e1'].status).toBe('running')
  })

  it('handles solve_complete SSE event — removes solve progress and refreshes activity', async () => {
    const completionActivity = {
      id: 'activity-1',
      userId: 'system',
      ts: new Date().toISOString(),
      kind: 'solve_resolved',
      eventId: 'e1',
      solveId: 's1',
      title: 'AI mission resolved',
      detail: 'Done',
      severity: 'info',
    }
    mockStellarApi.listActivity.mockResolvedValue([completionActivity])
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('solve_started', { solveId: 's1', eventId: 'e1' })
    })
    await act(async () => {
      es._triggerEvent('solve_complete', { solveId: 's1', eventId: 'e1', status: 'complete', summary: 'Done' })
      await Promise.resolve()
    })
    expect(capturedRef.current?.solveProgress['e1']).toBeUndefined()
    await waitFor(() => {
      expect(mockStellarApi.listActivity).toHaveBeenCalled()
      expect(capturedRef.current?.activity[0]).toMatchObject({ id: 'activity-1', solveId: 's1' })
    })
  })

  it('handles digest SSE event — sets nudge with digest content', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('digest', { content: 'Daily summary: all clear', period: 'daily' })
    })
    expect(capturedRef.current?.nudge?.summary).toBe('Daily summary: all clear')
  })

  it('SSE error triggers isConnected false', async () => {
    vi.useFakeTimers()
    try {
      const { capturedRef } = renderWithProvider()
      await act(async () => { await Promise.resolve() })
      const es = eventSourceInstances[0]
      es._triggerOpen()
      await act(async () => { es._triggerError() })
      expect(capturedRef.current?.isConnected).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

