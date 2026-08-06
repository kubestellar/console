import { describe, it, expect, beforeEach, vi } from 'vitest'
import { send, emitUserEngagement } from './analytics-dispatch'
import { setInitialized, setUserHasInteracted } from './analytics-core-state'
import { STORAGE_KEY_ANALYTICS_OPT_OUT } from './constants'

const dispatchMock = vi.fn()
vi.mock('./analytics-providers', () => ({
  dispatchAnalyticsEvent: (name: string, params?: unknown) => dispatchMock(name, params),
}))

// peekEngagementMs is used only by emitUserEngagement; keep isOptedOut real
// so the opt-out gate (localStorage-backed) is exercised end-to-end.
const engagementMs = { value: 0 }
vi.mock('./analytics-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./analytics-session')>()
  return {
    ...actual,
    peekEngagementMs: () => engagementMs.value,
  }
})

describe('analytics-dispatch', () => {
  beforeEach(() => {
    dispatchMock.mockClear()
    engagementMs.value = 0
    localStorage.clear()
    // start each test in a "ready to send" state
    setInitialized(true)
    setUserHasInteracted(true)
  })

  describe('send', () => {
    it('forwards event name and params to the provider when all gates pass', () => {
      send('foo_event', { a: 1 })
      expect(dispatchMock).toHaveBeenCalledTimes(1)
      expect(dispatchMock).toHaveBeenCalledWith('foo_event', { a: 1 })
    })

    it('is a no-op when not initialized', () => {
      setInitialized(false)
      send('foo_event', {})
      expect(dispatchMock).not.toHaveBeenCalled()
    })

    it('is a no-op when the user has not interacted yet', () => {
      setUserHasInteracted(false)
      send('foo_event', {})
      expect(dispatchMock).not.toHaveBeenCalled()
    })

    it('is a no-op when the user is opted out and no bypass is set', () => {
      localStorage.setItem(STORAGE_KEY_ANALYTICS_OPT_OUT, 'true')
      send('foo_event', {})
      expect(dispatchMock).not.toHaveBeenCalled()
    })

    it('honors bypassOptOut and dispatches even when opted out', () => {
      localStorage.setItem(STORAGE_KEY_ANALYTICS_OPT_OUT, 'true')
      send('critical_event', { reason: 'x' }, { bypassOptOut: true })
      expect(dispatchMock).toHaveBeenCalledWith('critical_event', { reason: 'x' })
    })

    it('bypassOptOut does NOT bypass the initialized or interaction gates', () => {
      localStorage.setItem(STORAGE_KEY_ANALYTICS_OPT_OUT, 'true')
      setInitialized(false)
      send('e', {}, { bypassOptOut: true })
      expect(dispatchMock).not.toHaveBeenCalled()

      setInitialized(true)
      setUserHasInteracted(false)
      send('e', {}, { bypassOptOut: true })
      expect(dispatchMock).not.toHaveBeenCalled()
    })

    it('passes undefined params through when caller omits them', () => {
      send('plain_event')
      expect(dispatchMock).toHaveBeenCalledWith('plain_event', undefined)
    })
  })

  describe('emitUserEngagement', () => {
    it('sends user_engagement when engagement time is positive', () => {
      engagementMs.value = 42
      emitUserEngagement()
      expect(dispatchMock).toHaveBeenCalledWith('user_engagement', {})
    })

    it('does not send when engagement time is zero', () => {
      engagementMs.value = 0
      emitUserEngagement()
      expect(dispatchMock).not.toHaveBeenCalled()
    })

    it('does not send when engagement time is negative', () => {
      engagementMs.value = -1
      emitUserEngagement()
      expect(dispatchMock).not.toHaveBeenCalled()
    })

    it('still respects the send() gates (opted out -> no dispatch)', () => {
      engagementMs.value = 100
      localStorage.setItem(STORAGE_KEY_ANALYTICS_OPT_OUT, 'true')
      emitUserEngagement()
      expect(dispatchMock).not.toHaveBeenCalled()
    })
  })
})
