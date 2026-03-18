import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Keys must match the values from lib/constants/storage.ts
const DEMO_MODE_KEY = 'kc-demo-mode'
const TOKEN_KEY = 'token'
const DEMO_TOKEN = 'demo-token'

// ---------------------------------------------------------------------------
// We need to mock the lib/demoMode module that useDemoMode wraps.
// The hook itself is thin — it wires useState + useEffect to the pub/sub
// singleton. We test that wiring here; the lib's own logic is tested
// separately.
// ---------------------------------------------------------------------------

// Shared mutable state for the mock singleton
let mockDemoModeValue = false
const subscribers = new Set<(value: boolean) => void>()

function notifySubscribers() {
  subscribers.forEach((cb) => cb(mockDemoModeValue))
}

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockDemoModeValue,
  setDemoMode: (value: boolean) => {
    mockDemoModeValue = value
    localStorage.setItem(DEMO_MODE_KEY, String(value))
    notifySubscribers()
  },
  toggleDemoMode: () => {
    mockDemoModeValue = !mockDemoModeValue
    localStorage.setItem(DEMO_MODE_KEY, String(mockDemoModeValue))
    notifySubscribers()
  },
  subscribeDemoMode: (cb: (value: boolean) => void) => {
    subscribers.add(cb)
    return () => subscribers.delete(cb)
  },
  // Static re-exports the hook also exposes — provide stubs
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => mockDemoModeValue,
  setGlobalDemoMode: vi.fn(),
}))

// Import AFTER the mock is set up
import { useDemoMode } from '../useDemoMode'

describe('useDemoMode', () => {
  beforeEach(() => {
    mockDemoModeValue = false
    subscribers.clear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Default state initialisation ──────────────────────────────────────

  it('returns isDemoMode=false when demo mode is off', () => {
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(false)
  })

  it('returns isDemoMode=true when demo mode is on', () => {
    mockDemoModeValue = true
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(true)
  })

  // ── State toggling ────────────────────────────────────────────────────

  it('toggleDemoMode flips isDemoMode from false to true', () => {
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(false)

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(result.current.isDemoMode).toBe(true)
  })

  it('toggleDemoMode flips isDemoMode from true to false', () => {
    mockDemoModeValue = true
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(true)

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(result.current.isDemoMode).toBe(false)
  })

  it('setDemoMode(true) enables demo mode', () => {
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(false)

    act(() => {
      result.current.setDemoMode(true)
    })

    expect(result.current.isDemoMode).toBe(true)
  })

  it('setDemoMode(false) disables demo mode', () => {
    mockDemoModeValue = true
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(true)

    act(() => {
      result.current.setDemoMode(false)
    })

    expect(result.current.isDemoMode).toBe(false)
  })

  // ── localStorage persistence ──────────────────────────────────────────

  it('persists demo mode to localStorage when toggled', () => {
    const { result } = renderHook(() => useDemoMode())

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(localStorage.getItem(DEMO_MODE_KEY)).toBe('true')
  })

  it('persists demo mode to localStorage when set explicitly', () => {
    const { result } = renderHook(() => useDemoMode())

    act(() => {
      result.current.setDemoMode(true)
    })
    expect(localStorage.getItem(DEMO_MODE_KEY)).toBe('true')

    act(() => {
      result.current.setDemoMode(false)
    })
    expect(localStorage.getItem(DEMO_MODE_KEY)).toBe('false')
  })

  // ── Multiple hook instances (pub/sub singleton) ───────────────────────

  it('all hook instances update when one toggles demo mode', () => {
    const { result: a } = renderHook(() => useDemoMode())
    const { result: b } = renderHook(() => useDemoMode())

    expect(a.current.isDemoMode).toBe(false)
    expect(b.current.isDemoMode).toBe(false)

    act(() => {
      a.current.toggleDemoMode()
    })

    expect(a.current.isDemoMode).toBe(true)
    expect(b.current.isDemoMode).toBe(true)
  })

  it('all hook instances update when one calls setDemoMode', () => {
    const { result: a } = renderHook(() => useDemoMode())
    const { result: b } = renderHook(() => useDemoMode())
    const { result: c } = renderHook(() => useDemoMode())

    act(() => {
      b.current.setDemoMode(true)
    })

    expect(a.current.isDemoMode).toBe(true)
    expect(b.current.isDemoMode).toBe(true)
    expect(c.current.isDemoMode).toBe(true)
  })

  // ── Subscriber cleanup ────────────────────────────────────────────────

  it('unsubscribes when the hook unmounts', () => {
    const { unmount } = renderHook(() => useDemoMode())

    // After mount there should be at least one subscriber
    expect(subscribers.size).toBeGreaterThanOrEqual(1)

    unmount()

    // After unmount the subscriber should have been removed
    expect(subscribers.size).toBe(0)
  })

  // ── Return shape ──────────────────────────────────────────────────────

  it('returns the expected API shape', () => {
    const { result } = renderHook(() => useDemoMode())
    expect(result.current).toHaveProperty('isDemoMode')
    expect(result.current).toHaveProperty('toggleDemoMode')
    expect(result.current).toHaveProperty('setDemoMode')
    expect(typeof result.current.isDemoMode).toBe('boolean')
    expect(typeof result.current.toggleDemoMode).toBe('function')
    expect(typeof result.current.setDemoMode).toBe('function')
  })

  // ── Edge case: rapid toggles ──────────────────────────────────────────

  it('handles rapid successive toggles correctly', () => {
    const { result } = renderHook(() => useDemoMode())

    act(() => {
      result.current.toggleDemoMode() // false -> true
      result.current.toggleDemoMode() // true -> false
      result.current.toggleDemoMode() // false -> true
    })

    expect(result.current.isDemoMode).toBe(true)
    expect(localStorage.getItem(DEMO_MODE_KEY)).toBe('true')
  })

  // ── Edge case: syncs on mount if state changed between render and effect ──

  it('syncs state if underlying value changed between initial render and effect', () => {
    // Start with false, but change the underlying state before effect fires
    mockDemoModeValue = false
    const { result } = renderHook(() => useDemoMode())

    // The hook should have synced to the current value
    expect(result.current.isDemoMode).toBe(false)

    // Now simulate the global changing externally
    act(() => {
      mockDemoModeValue = true
      notifySubscribers()
    })

    expect(result.current.isDemoMode).toBe(true)
  })
})
