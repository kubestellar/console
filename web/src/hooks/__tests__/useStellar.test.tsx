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
import { render, screen, act, renderHook } from '@testing-library/react'
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
  vi.useRealTimers()
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
      es._triggerEvent('catchup', { summary: 'You missed 3 events', kind: 'digest' })
    })
    expect(capturedRef.current?.catchUp?.summary).toBe('You missed 3 events')
    expect(capturedRef.current?.catchUp?.kind).toBe('digest')
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

  it('handles solve_complete SSE event — removes solve progress', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('solve_started', { solveId: 's1', eventId: 'e1' })
    })
    await act(async () => {
      es._triggerEvent('solve_complete', { solveId: 's1', eventId: 'e1', status: 'complete', summary: 'Done' })
    })
    expect(capturedRef.current?.solveProgress['e1']).toBeUndefined()
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
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => { es._triggerError() })
    expect(capturedRef.current?.isConnected).toBe(false)
    vi.useRealTimers()
  })
})

describe('StellarProvider — actions', () => {
  it('acknowledgeNotification removes notification optimistically', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    // Seed notification
    await act(async () => {
      es._triggerEvent('notification', {
        id: 'n1', type: 'event', severity: 'info',
        title: 'T', body: 'B', read: false, createdAt: new Date().toISOString(),
      })
    })
    expect(capturedRef.current?.notifications.some(n => n.id === 'n1')).toBe(true)
    await act(async () => {
      await capturedRef.current?.acknowledgeNotification('n1')
    })
    expect(capturedRef.current?.notifications.some(n => n.id === 'n1')).toBe(false)
    expect(mockStellarApi.acknowledgeNotification).toHaveBeenCalledWith('n1')
  })

  it('acknowledgeNotification restores notification if API call fails', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('notification', {
        id: 'n2', type: 'event', severity: 'info',
        title: 'T', body: 'B', read: false, createdAt: new Date().toISOString(),
      })
    })
    mockStellarApi.acknowledgeNotification.mockRejectedValueOnce(new Error('server error'))
    await act(async () => {
      try { await capturedRef.current?.acknowledgeNotification('n2') } catch { /* expected */ }
    })
    // Notification should be restored after failure
    expect(capturedRef.current?.notifications.some(n => n.id === 'n2')).toBe(true)
  })

  it('approveAction removes action from pendingActions', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('initial_batch', {
        pendingActions: [{ id: 'a1', status: 'pending_approval', description: 'Deploy' }],
      })
    })
    await act(async () => { await capturedRef.current?.approveAction('a1') })
    expect(capturedRef.current?.pendingActions.some(a => a.id === 'a1')).toBe(false)
    expect(mockStellarApi.approveAction).toHaveBeenCalledWith('a1', undefined)
  })

  it('rejectAction removes action from pendingActions', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('initial_batch', {
        pendingActions: [{ id: 'a2', status: 'pending_approval', description: 'Scale down' }],
      })
    })
    await act(async () => { await capturedRef.current?.rejectAction('a2', 'not safe') })
    expect(capturedRef.current?.pendingActions.some(a => a.id === 'a2')).toBe(false)
    expect(mockStellarApi.rejectAction).toHaveBeenCalledWith('a2', 'not safe')
  })

  it('dismissNudge clears nudge', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('observation', { id: 'obs1', summary: 'High CPU' })
    })
    expect(capturedRef.current?.nudge).not.toBeNull()
    act(() => { capturedRef.current?.dismissNudge() })
    expect(capturedRef.current?.nudge).toBeNull()
  })

  it('dismissCatchUp clears catchUp state', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('catchup', { summary: 'Missed events', kind: 'digest' })
    })
    expect(capturedRef.current?.catchUp).not.toBeNull()
    act(() => { capturedRef.current?.dismissCatchUp() })
    expect(capturedRef.current?.catchUp).toBeNull()
  })
})

describe('StellarProvider — task management', () => {
  it('updateTaskStatus "done" removes task from list', async () => {
    mockStellarApi.getTasks.mockResolvedValue([
      { id: 't1', title: 'Fix bug', description: '', source: 'user', status: 'todo', priority: 5, createdAt: new Date().toISOString() },
    ])
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await capturedRef.current?.updateTaskStatus('t1', 'done') })
    expect(capturedRef.current?.tasks.some(t => t.id === 't1')).toBe(false)
    expect(mockStellarApi.updateTaskStatus).toHaveBeenCalledWith('t1', 'done')
  })

  it('updateTaskStatus "done" restores task on API failure', async () => {
    mockStellarApi.getTasks.mockResolvedValue([
      { id: 't2', title: 'Review PR', description: '', source: 'user', status: 'todo', priority: 3, createdAt: new Date().toISOString() },
    ])
    mockStellarApi.updateTaskStatus.mockRejectedValueOnce(new Error('server error'))
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => {
      try { await capturedRef.current?.updateTaskStatus('t2', 'done') } catch { /* expected */ }
    })
    expect(capturedRef.current?.tasks.some(t => t.id === 't2')).toBe(true)
  })

  it('createTask adds new task and returns it', async () => {
    const newTask = { id: 'tnew', title: 'Deploy v2', description: '', source: 'user', status: 'todo', priority: 5, createdAt: new Date().toISOString() }
    mockStellarApi.createTask.mockResolvedValueOnce(newTask)
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    let created: unknown
    await act(async () => {
      created = await capturedRef.current?.createTask('Deploy v2', 'description', 'user')
    })
    expect(created).toMatchObject({ id: 'tnew', title: 'Deploy v2' })
    expect(capturedRef.current?.tasks.some(t => t.id === 'tnew')).toBe(true)
  })
})

describe('StellarProvider — watch management', () => {
  it('resolveWatch removes watch optimistically', async () => {
    mockStellarApi.getWatches.mockResolvedValue([
      { id: 'w1', cluster: 'c1', query: 'node NotReady', status: 'active', createdAt: new Date().toISOString() },
    ])
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await capturedRef.current?.resolveWatch('w1') })
    expect(capturedRef.current?.watches.some(w => w.id === 'w1')).toBe(false)
    expect(mockStellarApi.resolveWatch).toHaveBeenCalledWith('w1')
  })

  it('dismissWatch removes watch optimistically', async () => {
    mockStellarApi.getWatches.mockResolvedValue([
      { id: 'w2', cluster: 'c1', query: 'pod OOMKilled', status: 'active', createdAt: new Date().toISOString() },
    ])
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await capturedRef.current?.dismissWatch('w2') })
    expect(capturedRef.current?.watches.some(w => w.id === 'w2')).toBe(false)
    expect(mockStellarApi.dismissWatch).toHaveBeenCalledWith('w2')
  })

  it('snoozeWatch calls api without removing watch', async () => {
    mockStellarApi.getWatches.mockResolvedValue([
      { id: 'w3', cluster: 'c1', query: 'deployment failing', status: 'active', createdAt: new Date().toISOString() },
    ])
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await capturedRef.current?.snoozeWatch('w3', 60) })
    expect(mockStellarApi.snoozeWatch).toHaveBeenCalledWith('w3', 60)
  })
})

describe('StellarProvider — startSolve', () => {
  it('optimistically sets solveProgress to running', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    act(() => {
      void capturedRef.current?.startSolve('event-42')
    })
    expect(capturedRef.current?.solveProgress['event-42']?.status).toBe('running')
  })

  it('removes solveProgress on API failure', async () => {
    mockStellarApi.startSolve.mockRejectedValueOnce(new Error('solve failed'))
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => {
      try { await capturedRef.current?.startSolve('event-99') } catch { /* expected */ }
    })
    expect(capturedRef.current?.solveProgress['event-99']).toBeUndefined()
  })
})

describe('StellarProvider — dismissAllNotifications', () => {
  it('clears all notifications and calls API for each', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    // Seed 2 notifications
    await act(async () => {
      es._triggerEvent('notification', { id: 'n1', type: 'event', severity: 'info', title: 'T1', body: 'B', read: false, createdAt: new Date().toISOString() })
      es._triggerEvent('notification', { id: 'n2', type: 'event', severity: 'info', title: 'T2', body: 'B', read: false, createdAt: new Date().toISOString() })
    })
    expect(capturedRef.current?.notifications).toHaveLength(2)
    await act(async () => { await capturedRef.current?.dismissAllNotifications() })
    expect(capturedRef.current?.notifications).toHaveLength(0)
    expect(mockStellarApi.acknowledgeNotification).toHaveBeenCalledTimes(2)
  })

  it('is a no-op when notifications list is empty', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await capturedRef.current?.dismissAllNotifications() })
    expect(mockStellarApi.acknowledgeNotification).not.toHaveBeenCalled()
  })
})

describe('StellarProvider — unreadCount', () => {
  it('counts only unread notifications', async () => {
    const { capturedRef } = renderWithProvider()
    await act(async () => { await Promise.resolve() })
    const es = eventSourceInstances[0]
    es._triggerOpen()
    await act(async () => {
      es._triggerEvent('notification', { id: 'n1', type: 'event', severity: 'info', title: 'T', body: 'B', read: false, createdAt: new Date().toISOString() })
      es._triggerEvent('notification', { id: 'n2', type: 'event', severity: 'info', title: 'T', body: 'B', read: false, createdAt: new Date().toISOString() })
    })
    expect(capturedRef.current?.unreadCount).toBe(2)
    // Acknowledge one
    await act(async () => { await capturedRef.current?.acknowledgeNotification('n1') })
    expect(capturedRef.current?.unreadCount).toBe(1)
  })
})

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
    window.removeEventListener(STELLAR_MISSION_TRIGGER_EVENT, handler)
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
    vi.useRealTimers()
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
