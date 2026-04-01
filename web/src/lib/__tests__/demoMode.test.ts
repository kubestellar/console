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
} from '../demoMode'

describe('isDemoMode', () => {
  it('returns a boolean', () => {
    expect(typeof isDemoMode()).toBe('boolean')
  })
})

describe('isDemoToken', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns true when no token', () => {
    expect(isDemoToken()).toBe(true)
  })

  it('returns true for demo-token', () => {
    localStorage.setItem('token', 'demo-token')
    expect(isDemoToken()).toBe(true)
  })

  it('returns false for real token', () => {
    localStorage.setItem('token', 'real-jwt-token')
    expect(isDemoToken()).toBe(false)
  })
})

describe('hasRealToken', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns false when no token', () => {
    expect(hasRealToken()).toBe(false)
  })

  it('returns false for demo token', () => {
    localStorage.setItem('token', 'demo-token')
    expect(hasRealToken()).toBe(false)
  })

  it('returns true for real token', () => {
    localStorage.setItem('token', 'real-jwt-token')
    expect(hasRealToken()).toBe(true)
  })
})

describe('canToggleDemoMode', () => {
  it('returns a boolean', () => {
    expect(typeof canToggleDemoMode()).toBe('boolean')
  })
})

describe('setDemoMode', () => {
  beforeEach(() => { localStorage.clear() })

  it('changes demo mode state', () => {
    const initial = isDemoMode()
    setDemoMode(!initial, true)
    expect(isDemoMode()).toBe(!initial)
    // Reset
    setDemoMode(initial, true)
  })

  it('persists to localStorage', () => {
    setDemoMode(true, true)
    expect(localStorage.getItem('kc-demo-mode')).toBe('true')
    setDemoMode(false, true)
    expect(localStorage.getItem('kc-demo-mode')).toBe('false')
  })

  it('does not change if value is same as current', () => {
    const listener = vi.fn()
    const unsub = subscribeDemoMode(listener)
    const current = isDemoMode()
    setDemoMode(current, true)
    expect(listener).not.toHaveBeenCalled()
    unsub()
  })
})

describe('toggleDemoMode', () => {
  beforeEach(() => { localStorage.clear() })

  it('flips demo mode', () => {
    const before = isDemoMode()
    toggleDemoMode()
    expect(isDemoMode()).toBe(!before)
    // Toggle back
    toggleDemoMode()
    expect(isDemoMode()).toBe(before)
  })
})

describe('subscribeDemoMode', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('calls callback when demo mode changes', () => {
    const cb = vi.fn()
    const unsub = subscribeDemoMode(cb)
    const before = isDemoMode()
    setDemoMode(!before, true)
    expect(cb).toHaveBeenCalledWith(!before)
    // Reset
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
    // Reset
    setDemoMode(before, true)
  })

  it('supports multiple subscribers', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = subscribeDemoMode(cb1)
    const unsub2 = subscribeDemoMode(cb2)
    const before = isDemoMode()
    setDemoMode(!before, true)
    expect(cb1).toHaveBeenCalled()
    expect(cb2).toHaveBeenCalled()
    setDemoMode(before, true)
    unsub1()
    unsub2()
  })
})

describe('setDemoToken', () => {
  beforeEach(() => { localStorage.clear() })

  it('sets demo-token in localStorage', () => {
    setDemoToken()
    expect(localStorage.getItem('token')).toBe('demo-token')
  })
})

describe('legacy exports', () => {
  it('getDemoMode is same as isDemoMode', () => {
    expect(getDemoMode).toBe(isDemoMode)
  })

  it('setGlobalDemoMode is same as setDemoMode', () => {
    expect(setGlobalDemoMode).toBe(setDemoMode)
  })
})
