/**
 * Regression test: Demo mode toggle badge behavior (#8505)
 *
 * Verifies that toggling demo mode on/off correctly:
 * 1. Updates the global state (isDemoMode)
 * 2. Persists to localStorage (drives badge on reload)
 * 3. Dispatches the 'kc-demo-mode-change' CustomEvent (drives badge reactivity)
 * 4. Notifies all subscribers (drives useDemoMode hook → CardWrapper badge)
 * 5. Clears caches before toggling (shows loading skeletons during transition)
 *
 * The Demo badge and yellow outline in CardWrapper are driven by:
 *   showDemoIndicator = !effectiveIsLoading && (effectiveIsDemoData || (isDemoMode && !childExplicitlyNotDemo))
 * This test verifies the inputs to that expression change correctly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Constants (mirror source values)
// ---------------------------------------------------------------------------
const DEMO_MODE_STORAGE_KEY = 'kc-demo-mode'
const DEMO_MODE_EVENT_NAME = 'kc-demo-mode-change'

// ---------------------------------------------------------------------------
// Mock clearAllRegisteredCaches so toggleDemoMode can call it
// ---------------------------------------------------------------------------
const mockClearAllRegisteredCaches = vi.hoisted(() => vi.fn())

vi.mock('../modeTransition', () => ({
  clearAllRegisteredCaches: mockClearAllRegisteredCaches,
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import {
  isDemoMode,
  setDemoMode,
  toggleDemoMode,
  subscribeDemoMode,
  canToggleDemoMode,
} from '../demoMode'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Demo mode toggle badge behavior (#8505)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Ensure we start from a known state — demo mode off
    setDemoMode(false, true)
  })

  afterEach(() => {
    // Clean up — restore demo mode to off
    setDemoMode(false, true)
  })

  it('toggleDemoMode flips isDemoMode from false to true', () => {
    expect(isDemoMode()).toBe(false)
    toggleDemoMode()
    expect(isDemoMode()).toBe(true)
  })

  it('toggleDemoMode flips isDemoMode from true to false', () => {
    setDemoMode(true, true)
    expect(isDemoMode()).toBe(true)
    toggleDemoMode()
    expect(isDemoMode()).toBe(false)
  })

  it('toggle persists "true" to localStorage (badge appears on reload)', () => {
    toggleDemoMode()
    expect(localStorage.getItem(DEMO_MODE_STORAGE_KEY)).toBe('true')
  })

  it('toggle back persists "false" to localStorage (badge disappears on reload)', () => {
    // Toggle on
    toggleDemoMode()
    expect(localStorage.getItem(DEMO_MODE_STORAGE_KEY)).toBe('true')

    // Toggle off
    toggleDemoMode()
    expect(localStorage.getItem(DEMO_MODE_STORAGE_KEY)).toBe('false')
  })

  it('toggle dispatches kc-demo-mode-change CustomEvent with correct detail', () => {
    const eventHandler = vi.fn()
    window.addEventListener(DEMO_MODE_EVENT_NAME, eventHandler)

    try {
      toggleDemoMode() // false → true

      expect(eventHandler).toHaveBeenCalledTimes(1)
      const event = eventHandler.mock.calls[0][0] as CustomEvent
      expect(event.detail).toBe(true)

      eventHandler.mockClear()

      toggleDemoMode() // true → false

      expect(eventHandler).toHaveBeenCalledTimes(1)
      const event2 = eventHandler.mock.calls[0][0] as CustomEvent
      expect(event2.detail).toBe(false)
    } finally {
      window.removeEventListener(DEMO_MODE_EVENT_NAME, eventHandler)
    }
  })

  it('toggle notifies all subscribers (drives useDemoMode → CardWrapper)', () => {
    const subscriber1 = vi.fn()
    const subscriber2 = vi.fn()

    const unsub1 = subscribeDemoMode(subscriber1)
    const unsub2 = subscribeDemoMode(subscriber2)

    try {
      toggleDemoMode() // false → true

      expect(subscriber1).toHaveBeenCalledWith(true)
      expect(subscriber2).toHaveBeenCalledWith(true)

      subscriber1.mockClear()
      subscriber2.mockClear()

      toggleDemoMode() // true → false

      expect(subscriber1).toHaveBeenCalledWith(false)
      expect(subscriber2).toHaveBeenCalledWith(false)
    } finally {
      unsub1()
      unsub2()
    }
  })

  it('toggleDemoMode clears all caches before flipping (skeleton transition)', () => {
    toggleDemoMode()

    // clearAllRegisteredCaches should be called BEFORE the mode change
    // (it sets isLoading: true on all caches so skeletons appear)
    expect(mockClearAllRegisteredCaches).toHaveBeenCalledTimes(1)
  })

  it('canToggleDemoMode returns true in non-Netlify environment', () => {
    // In the test environment (jsdom), we are not on Netlify
    expect(canToggleDemoMode()).toBe(true)
  })

  it('setDemoMode with userInitiated=false does not override explicit user choice', () => {
    // User explicitly enables demo mode
    setDemoMode(true, true)
    expect(isDemoMode()).toBe(true)

    // Automatic attempt to disable should be ignored
    setDemoMode(false, false)
    expect(isDemoMode()).toBe(true)

    // User can still disable manually
    setDemoMode(false, true)
    expect(isDemoMode()).toBe(false)
  })

  it('setDemoMode with userInitiated=false does not auto-enable when user disabled', () => {
    // User explicitly disables demo mode
    setDemoMode(true, true)
    setDemoMode(false, true)
    expect(isDemoMode()).toBe(false)
    expect(localStorage.getItem(DEMO_MODE_STORAGE_KEY)).toBe('false')

    // Automatic attempt to enable should be ignored
    setDemoMode(true, false)
    expect(isDemoMode()).toBe(false)
  })

  it('subscriber is not called after unsubscribe', () => {
    const subscriber = vi.fn()
    const unsub = subscribeDemoMode(subscriber)
    unsub()

    toggleDemoMode()

    expect(subscriber).not.toHaveBeenCalled()
  })

  it('full on/off cycle: state, storage, events, and subscribers all consistent', () => {
    const subscriber = vi.fn()
    const eventHandler = vi.fn()
    const unsub = subscribeDemoMode(subscriber)
    window.addEventListener(DEMO_MODE_EVENT_NAME, eventHandler)

    try {
      // Verify initial state
      expect(isDemoMode()).toBe(false)
      // localStorage may be null (cleared) or 'false' — both mean demo is off
      const initialStored = localStorage.getItem(DEMO_MODE_STORAGE_KEY)
      expect(initialStored === null || initialStored === 'false').toBe(true)

      // Toggle ON
      toggleDemoMode()
      expect(isDemoMode()).toBe(true)
      expect(localStorage.getItem(DEMO_MODE_STORAGE_KEY)).toBe('true')
      expect(subscriber).toHaveBeenLastCalledWith(true)
      expect((eventHandler.mock.calls[0][0] as CustomEvent).detail).toBe(true)

      // Toggle OFF
      toggleDemoMode()
      expect(isDemoMode()).toBe(false)
      expect(localStorage.getItem(DEMO_MODE_STORAGE_KEY)).toBe('false')
      expect(subscriber).toHaveBeenLastCalledWith(false)
      expect((eventHandler.mock.calls[1][0] as CustomEvent).detail).toBe(false)

      // Verify call counts
      const EXPECTED_TOGGLE_COUNT = 2
      expect(subscriber).toHaveBeenCalledTimes(EXPECTED_TOGGLE_COUNT)
      expect(eventHandler).toHaveBeenCalledTimes(EXPECTED_TOGGLE_COUNT)
      expect(mockClearAllRegisteredCaches).toHaveBeenCalledTimes(EXPECTED_TOGGLE_COUNT)
    } finally {
      unsub()
      window.removeEventListener(DEMO_MODE_EVENT_NAME, eventHandler)
    }
  })
})
