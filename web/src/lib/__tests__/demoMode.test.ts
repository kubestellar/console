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

// ── GPU cache cleanup on init (lines 82-92 in source) ──

describe('GPU cache cleanup on init', () => {
  // These paths run at module-load time, so we must reset modules and re-import
  const GPU_CACHE_KEY = 'kubestellar-gpu-cache'
  const DEMO_MODE_KEY = 'kc-demo-mode'

  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('removes GPU cache when demo mode is off and cache contains demo cluster names', async () => {
    // Set up: demo mode off, GPU cache containing demo data
    localStorage.setItem(DEMO_MODE_KEY, 'false')
    localStorage.setItem(GPU_CACHE_KEY, JSON.stringify({
      nodes: [
        { cluster: 'vllm-gpu-cluster', gpu: 'A100', count: 2 },
        { cluster: 'gke-staging', gpu: 'V100', count: 1 },
      ],
    }))

    // Re-import so module init re-runs
    await import('../demoMode?fresh=gpu-cleanup-demo')

    // GPU cache should be removed
    expect(localStorage.getItem(GPU_CACHE_KEY)).toBeNull()
  })

  it('does not remove GPU cache when cache contains only real cluster names', async () => {
    localStorage.setItem(DEMO_MODE_KEY, 'false')
    const realData = JSON.stringify({
      nodes: [{ cluster: 'my-prod-cluster', gpu: 'A100', count: 4 }],
    })
    localStorage.setItem(GPU_CACHE_KEY, realData)

    await import('../demoMode?fresh=gpu-cleanup-real')

    // GPU cache should still be there
    expect(localStorage.getItem(GPU_CACHE_KEY)).toBe(realData)
  })

  it('does not remove GPU cache when demo mode is on', async () => {
    localStorage.setItem(DEMO_MODE_KEY, 'true')
    const demoData = JSON.stringify({
      nodes: [{ cluster: 'vllm-gpu-cluster', gpu: 'A100', count: 2 }],
    })
    localStorage.setItem(GPU_CACHE_KEY, demoData)

    await import('../demoMode?fresh=gpu-cleanup-on')

    // GPU cache should remain since demo mode is on
    expect(localStorage.getItem(GPU_CACHE_KEY)).toBe(demoData)
  })

  it('handles corrupt GPU cache JSON without throwing', async () => {
    localStorage.setItem(DEMO_MODE_KEY, 'false')
    localStorage.setItem(GPU_CACHE_KEY, 'invalid-json{{{')

    // Should not throw
    await expect(import('../demoMode?fresh=gpu-cleanup-corrupt')).resolves.toBeDefined()
  })
})

// ── Cross-tab storage event handler (lines 99-107 in source) ──

describe('cross-tab storage event sync', () => {
  const DEMO_MODE_KEY = 'kc-demo-mode'

  let initialDemoMode: boolean

  beforeEach(() => {
    localStorage.clear()
    initialDemoMode = isDemoMode()
  })

  afterEach(() => {
    setDemoMode(initialDemoMode, true)
    vi.restoreAllMocks()
  })

  it('updates globalDemoMode when storage event fires with new demo mode value', () => {
    // subscribeDemoMode lets us observe globalDemoMode changes
    let capturedValue: boolean | null = null
    const unsub = subscribeDemoMode((val) => { capturedValue = val })

    // Simulate another tab setting demo mode to true via storage event
    window.dispatchEvent(new StorageEvent('storage', {
      key: DEMO_MODE_KEY,
      newValue: 'true',
    }))
    expect(capturedValue).toBe(true)
    unsub()
  })

  it('does not re-notify when storage event value matches current globalDemoMode', () => {
    // Set globalDemoMode to true first
    setDemoMode(true, true)

    let callCount = 0
    const unsub = subscribeDemoMode(() => { callCount++ })

    // Fire storage event with same value
    window.dispatchEvent(new StorageEvent('storage', {
      key: DEMO_MODE_KEY,
      newValue: 'true',
    }))
    expect(callCount).toBe(0)
    unsub()
  })

  it('ignores storage events for unrelated keys', () => {
    let capturedValue: boolean | null = null
    const unsub = subscribeDemoMode((val) => { capturedValue = val })

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'some-other-key',
      newValue: 'true',
    }))

    expect(capturedValue).toBeNull()
    unsub()
  })
})
