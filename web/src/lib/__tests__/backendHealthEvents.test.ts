/**
 * Tests for lib/backendHealthEvents.ts — custom event bus for backend health.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  shouldMarkBackendUnavailable,
  reportBackendAvailable,
  reportBackendUnavailable,
  subscribeToBackendHealthEvents,
  type BackendHealthEventDetail,
} from '../backendHealthEvents'

const EVENT_NAME = 'kc:backend-health'

describe('shouldMarkBackendUnavailable', () => {
  it.each([502, 503, 504])('returns true for status %i', (status) => {
    expect(shouldMarkBackendUnavailable(status)).toBe(true)
  })

  it.each([200, 400, 401, 404, 500])('returns false for status %i', (status) => {
    expect(shouldMarkBackendUnavailable(status)).toBe(false)
  })
})

describe('reportBackendAvailable', () => {
  it('dispatches event with isAvailable:true and default source http', () => {
    const events: BackendHealthEventDetail[] = []
    const handler = (e: Event) => {
      events.push((e as CustomEvent<BackendHealthEventDetail>).detail)
    }
    window.addEventListener(EVENT_NAME, handler)

    reportBackendAvailable()

    window.removeEventListener(EVENT_NAME, handler)
    expect(events).toHaveLength(1)
    expect(events[0].isAvailable).toBe(true)
    expect(events[0].source).toBe('http')
  })

  it('dispatches event with custom source and status', () => {
    const events: BackendHealthEventDetail[] = []
    const handler = (e: Event) => {
      events.push((e as CustomEvent<BackendHealthEventDetail>).detail)
    }
    window.addEventListener(EVENT_NAME, handler)

    reportBackendAvailable('ws', 101)

    window.removeEventListener(EVENT_NAME, handler)
    expect(events[0].source).toBe('ws')
    expect(events[0].status).toBe(101)
    expect(events[0].isAvailable).toBe(true)
  })
})

describe('reportBackendUnavailable', () => {
  it('dispatches event with isAvailable:false and default source http', () => {
    const events: BackendHealthEventDetail[] = []
    const handler = (e: Event) => {
      events.push((e as CustomEvent<BackendHealthEventDetail>).detail)
    }
    window.addEventListener(EVENT_NAME, handler)

    reportBackendUnavailable()

    window.removeEventListener(EVENT_NAME, handler)
    expect(events[0].isAvailable).toBe(false)
    expect(events[0].source).toBe('http')
  })

  it('dispatches with health source and status 503', () => {
    const events: BackendHealthEventDetail[] = []
    const handler = (e: Event) => {
      events.push((e as CustomEvent<BackendHealthEventDetail>).detail)
    }
    window.addEventListener(EVENT_NAME, handler)

    reportBackendUnavailable('health', 503)

    window.removeEventListener(EVENT_NAME, handler)
    expect(events[0].source).toBe('health')
    expect(events[0].status).toBe(503)
  })
})

describe('subscribeToBackendHealthEvents', () => {
  it('calls listener when backend available event fires', () => {
    const listener = vi.fn()
    const unsub = subscribeToBackendHealthEvents(listener)

    reportBackendAvailable('ws')
    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0][0].isAvailable).toBe(true)
    expect(listener.mock.calls[0][0].source).toBe('ws')

    unsub()
  })

  it('calls listener when backend unavailable event fires', () => {
    const listener = vi.fn()
    const unsub = subscribeToBackendHealthEvents(listener)

    reportBackendUnavailable('http', 503)
    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0][0].isAvailable).toBe(false)

    unsub()
  })

  it('stops receiving events after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = subscribeToBackendHealthEvents(listener)

    reportBackendAvailable()
    unsub()
    reportBackendAvailable()

    expect(listener).toHaveBeenCalledOnce()
  })

  it('multiple subscribers all receive events', () => {
    const l1 = vi.fn()
    const l2 = vi.fn()
    const u1 = subscribeToBackendHealthEvents(l1)
    const u2 = subscribeToBackendHealthEvents(l2)

    reportBackendUnavailable()

    expect(l1).toHaveBeenCalledOnce()
    expect(l2).toHaveBeenCalledOnce()
    u1()
    u2()
  })

  it('returns no-op unsub and dispatches nothing when window undefined', () => {
    // Simulate server-side / no window by temporarily hiding it
    const origWindow = global.window
    // @ts-expect-error — intentionally deleting for SSR test
    delete global.window

    const listener = vi.fn()
    const unsub = subscribeToBackendHealthEvents(listener)
    expect(typeof unsub).toBe('function')
    unsub() // should not throw

    global.window = origWindow
  })
})
