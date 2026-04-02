import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isDemoMode,
  isDemoToken,
  hasRealToken,
  canToggleDemoMode,
  setDemoMode,
  toggleDemoMode,
  subscribeDemoMode,
  setDemoToken,
  getDemoMode,
  setGlobalDemoMode,
  isNetlifyDeployment,
  isDemoModeForced,
} from '../demoMode'
import { STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE, STORAGE_KEY_DEMO_MODE } from '../constants/storage'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  // Reset demo mode to a known state for the next test
  // Use userInitiated to bypass auto-toggle guard
  setDemoMode(false, true)
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// isDemoMode
// ---------------------------------------------------------------------------

describe('isDemoMode', () => {
  it('returns a boolean', () => {
    expect(typeof isDemoMode()).toBe('boolean')
  })

  it('reflects changes made by setDemoMode', () => {
    setDemoMode(true, true)
    expect(isDemoMode()).toBe(true)
    setDemoMode(false, true)
    expect(isDemoMode()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isDemoToken
// ---------------------------------------------------------------------------

describe('isDemoToken', () => {
  it('returns true when no token exists', () => {
    expect(isDemoToken()).toBe(true)
  })

  it('returns true for demo-token value', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE)
    expect(isDemoToken()).toBe(true)
  })

  it('returns false for a real JWT token', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'eyJhbGciOiJSUzI1NiJ9.real-jwt')
    expect(isDemoToken()).toBe(false)
  })

  it('returns false for a non-empty arbitrary token', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'some-custom-token')
    expect(isDemoToken()).toBe(false)
  })

  it('returns true when token is explicitly empty string', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, '')
    // empty string is falsy, so !token is true
    expect(isDemoToken()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// hasRealToken
// ---------------------------------------------------------------------------

describe('hasRealToken', () => {
  it('returns false when no token exists', () => {
    expect(hasRealToken()).toBe(false)
  })

  it('returns false for demo token', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE)
    expect(hasRealToken()).toBe(false)
  })

  it('returns true for a real token', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt-token')
    expect(hasRealToken()).toBe(true)
  })

  it('is the inverse of isDemoToken for non-empty real tokens', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'jwt-abc-123')
    expect(hasRealToken()).toBe(!isDemoToken())
  })

  it('returns false for empty string token', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, '')
    expect(hasRealToken()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// canToggleDemoMode
// ---------------------------------------------------------------------------

describe('canToggleDemoMode', () => {
  it('returns a boolean', () => {
    expect(typeof canToggleDemoMode()).toBe('boolean')
  })

  it('returns the inverse of isNetlifyDeployment', () => {
    expect(canToggleDemoMode()).toBe(!isNetlifyDeployment)
  })
})

// ---------------------------------------------------------------------------
// setDemoMode
// ---------------------------------------------------------------------------

describe('setDemoMode', () => {
  it('changes demo mode state with userInitiated=true', () => {
    const initial = isDemoMode()
    setDemoMode(!initial, true)
    expect(isDemoMode()).toBe(!initial)
    setDemoMode(initial, true)
  })

  it('persists to localStorage', () => {
    setDemoMode(true, true)
    expect(localStorage.getItem(STORAGE_KEY_DEMO_MODE)).toBe('true')
    setDemoMode(false, true)
    expect(localStorage.getItem(STORAGE_KEY_DEMO_MODE)).toBe('false')
  })

  it('does not change state if value is the same as current', () => {
    const listener = vi.fn()
    const unsub = subscribeDemoMode(listener)
    const current = isDemoMode()
    setDemoMode(current, true)
    expect(listener).not.toHaveBeenCalled()
    unsub()
  })

  it('does not auto-disable if user explicitly enabled demo mode', () => {
    setDemoMode(true, true)
    expect(isDemoMode()).toBe(true)

    // Try to auto-disable (userInitiated=false)
    setDemoMode(false, false)
    // Should still be true because user explicitly enabled it
    expect(isDemoMode()).toBe(true)
  })

  it('does not auto-enable if user explicitly disabled demo mode', () => {
    // First enable, then explicitly disable to get localStorage = 'false'
    setDemoMode(true, true)
    setDemoMode(false, true)
    expect(isDemoMode()).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY_DEMO_MODE)).toBe('false')

    // Try to auto-enable (userInitiated=false)
    setDemoMode(true, false)
    // Should still be false because user explicitly disabled it
    expect(isDemoMode()).toBe(false)
  })

  it('notifies subscribers when state changes', () => {
    const listener = vi.fn()
    const unsub = subscribeDemoMode(listener)
    const before = isDemoMode()
    setDemoMode(!before, true)
    expect(listener).toHaveBeenCalledWith(!before)
    setDemoMode(before, true)
    unsub()
  })

  it('dispatches custom event on change', () => {
    const eventHandler = vi.fn()
    window.addEventListener('kc-demo-mode-change', eventHandler)

    const before = isDemoMode()
    setDemoMode(!before, true)

    expect(eventHandler).toHaveBeenCalled()
    const event = eventHandler.mock.calls[0][0] as CustomEvent
    expect(event.detail).toBe(!before)

    // Cleanup
    setDemoMode(before, true)
    window.removeEventListener('kc-demo-mode-change', eventHandler)
  })
})

// ---------------------------------------------------------------------------
// toggleDemoMode
// ---------------------------------------------------------------------------

describe('toggleDemoMode', () => {
  it('flips demo mode state', () => {
    const before = isDemoMode()
    toggleDemoMode()
    expect(isDemoMode()).toBe(!before)
    toggleDemoMode()
    expect(isDemoMode()).toBe(before)
  })

  it('is a user-initiated action (can turn off demo mode)', () => {
    setDemoMode(true, true)
    expect(isDemoMode()).toBe(true)

    toggleDemoMode() // should flip to false
    expect(isDemoMode()).toBe(false)
  })

  it('notifies subscribers', () => {
    const listener = vi.fn()
    const unsub = subscribeDemoMode(listener)
    toggleDemoMode()
    expect(listener).toHaveBeenCalled()
    // Toggle back
    toggleDemoMode()
    unsub()
  })
})

// ---------------------------------------------------------------------------
// subscribeDemoMode
// ---------------------------------------------------------------------------

describe('subscribeDemoMode', () => {
  it('calls callback when demo mode changes', () => {
    const cb = vi.fn()
    const unsub = subscribeDemoMode(cb)
    const before = isDemoMode()
    setDemoMode(!before, true)
    expect(cb).toHaveBeenCalledWith(!before)
    setDemoMode(before, true)
    unsub()
  })

  it('does not call callback after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = subscribeDemoMode(cb)
    unsub()
    const before = isDemoMode()
    setDemoMode(!before, true)
    expect(cb).not.toHaveBeenCalled()
    setDemoMode(before, true)
  })

  it('supports multiple subscribers', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const cb3 = vi.fn()
    const unsub1 = subscribeDemoMode(cb1)
    const unsub2 = subscribeDemoMode(cb2)
    const unsub3 = subscribeDemoMode(cb3)
    const before = isDemoMode()
    setDemoMode(!before, true)
    expect(cb1).toHaveBeenCalled()
    expect(cb2).toHaveBeenCalled()
    expect(cb3).toHaveBeenCalled()
    setDemoMode(before, true)
    unsub1()
    unsub2()
    unsub3()
  })

  it('only notifies subscribed callbacks (not unsubscribed)', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = subscribeDemoMode(cb1)
    const unsub2 = subscribeDemoMode(cb2)

    // Unsubscribe cb1
    unsub1()

    const before = isDemoMode()
    setDemoMode(!before, true)

    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalled()

    setDemoMode(before, true)
    unsub2()
  })

  it('returns a valid unsubscribe function', () => {
    const cb = vi.fn()
    const unsub = subscribeDemoMode(cb)
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('calling unsubscribe multiple times does not throw', () => {
    const cb = vi.fn()
    const unsub = subscribeDemoMode(cb)
    unsub()
    expect(() => unsub()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// setDemoToken
// ---------------------------------------------------------------------------

describe('setDemoToken', () => {
  it('sets the demo-token value in localStorage', () => {
    setDemoToken()
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBe(DEMO_TOKEN_VALUE)
  })

  it('overwrites existing token', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-token')
    setDemoToken()
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBe(DEMO_TOKEN_VALUE)
  })

  it('makes isDemoToken return true after setting', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-token')
    expect(isDemoToken()).toBe(false)
    setDemoToken()
    expect(isDemoToken()).toBe(true)
  })

  it('makes hasRealToken return false after setting', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-token')
    expect(hasRealToken()).toBe(true)
    setDemoToken()
    expect(hasRealToken()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Legacy exports
// ---------------------------------------------------------------------------

describe('legacy exports', () => {
  it('getDemoMode is the same function as isDemoMode', () => {
    expect(getDemoMode).toBe(isDemoMode)
  })

  it('setGlobalDemoMode is the same function as setDemoMode', () => {
    expect(setGlobalDemoMode).toBe(setDemoMode)
  })

  it('getDemoMode returns the same value as isDemoMode', () => {
    expect(getDemoMode()).toBe(isDemoMode())
  })
})

// ---------------------------------------------------------------------------
// Environment detection exports
// ---------------------------------------------------------------------------

describe('environment detection', () => {
  it('isNetlifyDeployment is a boolean', () => {
    expect(typeof isNetlifyDeployment).toBe('boolean')
  })

  it('isDemoModeForced equals isNetlifyDeployment', () => {
    expect(isDemoModeForced).toBe(isNetlifyDeployment)
  })

  it('in test environment (jsdom), isNetlifyDeployment is false', () => {
    // In jsdom, window.location.hostname is 'localhost' and VITE_DEMO_MODE is not set
    expect(isNetlifyDeployment).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Token + demo mode interaction
// ---------------------------------------------------------------------------

describe('token and demo mode interaction', () => {
  it('isDemoToken and hasRealToken are mutually exclusive for non-empty tokens', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt')
    expect(isDemoToken()).toBe(false)
    expect(hasRealToken()).toBe(true)

    localStorage.setItem(STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE)
    expect(isDemoToken()).toBe(true)
    expect(hasRealToken()).toBe(false)
  })

  it('setDemoToken followed by isDemoMode check works correctly', () => {
    setDemoToken()
    // Token is demo, but demo mode state depends on localStorage 'kc-demo-mode'
    // This just verifies no crash
    const mode = isDemoMode()
    expect(typeof mode).toBe('boolean')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('rapid toggles do not corrupt state', () => {
    const initial = isDemoMode()
    for (let i = 0; i < 20; i++) {
      toggleDemoMode()
    }
    // 20 toggles (even number) should return to initial state
    expect(isDemoMode()).toBe(initial)
  })

  it('rapid setDemoMode calls settle correctly', () => {
    setDemoMode(true, true)
    setDemoMode(false, true)
    setDemoMode(true, true)
    setDemoMode(false, true)
    expect(isDemoMode()).toBe(false)
  })

  it('subscribers receive correct value during rapid changes', () => {
    const values: boolean[] = []
    const unsub = subscribeDemoMode((v) => values.push(v))

    const initial = isDemoMode()
    setDemoMode(!initial, true)
    setDemoMode(initial, true)
    setDemoMode(!initial, true)

    // Should have received 3 change notifications
    expect(values).toHaveLength(3)
    expect(values[0]).toBe(!initial)
    expect(values[1]).toBe(initial)
    expect(values[2]).toBe(!initial)

    // Clean up
    setDemoMode(initial, true)
    unsub()
  })
})
