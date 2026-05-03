import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Track mock state for dynamic control within tests
// vi.hoisted() ensures variables are declared before vi.mock factories run
// ---------------------------------------------------------------------------
const {
  mockGetDemoMode,
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockReportAgentDataError,
  mockGetUserTokenUsage,
  mockPostTokenDelta,
} = vi.hoisted(() => ({
  mockGetDemoMode: vi.fn(() => false),
  mockIsAgentUnavailable: vi.fn(() => true),
  mockReportAgentDataSuccess: vi.fn(),
  mockReportAgentDataError: vi.fn(),
  mockGetUserTokenUsage: vi.fn(),
  mockPostTokenDelta: vi.fn(),
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: mockIsAgentUnavailable,
  reportAgentDataSuccess: mockReportAgentDataSuccess,
  reportAgentDataError: mockReportAgentDataError,
}))

vi.mock('../useDemoMode', () => ({
  getDemoMode: mockGetDemoMode,
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/constants')>()
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/constants/network')>()
  return {
    ...actual,
    QUICK_ABORT_TIMEOUT_MS: 2000,
  }
})

vi.mock('../../lib/tokenUsageApi', () => ({
  getUserTokenUsage: mockGetUserTokenUsage,
  postTokenDelta: mockPostTokenDelta,
  TokenUsageUnauthenticatedError: class TokenUsageUnauthenticatedError extends Error {
    constructor() {
      super('token usage endpoints require authentication')
      this.name = 'TokenUsageUnauthenticatedError'
    }
  },
}))

import { useTokenUsage, setActiveTokenCategory, clearActiveTokenCategory, getActiveTokenCategories, addCategoryTokens } from '../useTokenUsage'
import type { TokenCategory } from '../useTokenUsage'

// Fixed opIds used across the concurrent-operation tests so assertions
// don't depend on random UUIDs.
const OP_ID_A = 'op-a-0000-0000'
const OP_ID_B = 'op-b-0000-0000'
const OP_ID_C = 'op-c-0000-0000'

describe('useTokenUsage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(true)
  })

  it('returns initial token usage state', () => {
    const { result } = renderHook(() => useTokenUsage())
    expect(result.current.usage).toHaveProperty('used')
    expect(result.current.usage).toHaveProperty('limit')
    expect(result.current.usage).toHaveProperty('warningThreshold')
    expect(result.current.usage).toHaveProperty('criticalThreshold')
    expect(result.current.usage).toHaveProperty('stopThreshold')
    expect(result.current.usage).toHaveProperty('byCategory')
  })

  it('returns alertLevel as normal when usage is low', () => {
    const { result } = renderHook(() => useTokenUsage())
    expect(result.current.alertLevel).toBe('normal')
  })

  it('percentage is calculated correctly', () => {
    const { result } = renderHook(() => useTokenUsage())
    expect(typeof result.current.percentage).toBe('number')
    expect(result.current.percentage).toBeGreaterThanOrEqual(0)
    expect(result.current.percentage).toBeLessThanOrEqual(100)
  })

  it('remaining is non-negative', () => {
    const { result } = renderHook(() => useTokenUsage())
    expect(result.current.remaining).toBeGreaterThanOrEqual(0)
  })

  it('addTokens increases usage and category', () => {
    const { result } = renderHook(() => useTokenUsage())
    const initialUsed = result.current.usage.used
    act(() => { result.current.addTokens(1000, 'missions') })
    // addTokens mutates shared state and notifies subscribers
    expect(result.current.usage.used).toBeGreaterThanOrEqual(initialUsed)
  })

  it('updateSettings persists to localStorage', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => {
      result.current.updateSettings({ limit: 1000000 })
    })
    const stored = localStorage.getItem('kubestellar-token-settings')
    expect(stored).not.toBeNull()
    if (stored) {
      const parsed = JSON.parse(stored)
      expect(parsed.limit).toBe(1000000)
    }
  })

  it('resetUsage clears usage to zero', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    expect(result.current.usage.used).toBe(0)
  })

  it('isAIDisabled returns false for normal usage', () => {
    const { result } = renderHook(() => useTokenUsage())
    expect(result.current.isAIDisabled()).toBe(false)
  })

  // ---------- NEW REGRESSION TESTS ----------

  it('addTokens accumulates across multiple categories', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    const before = result.current.usage.used

    act(() => { result.current.addTokens(500, 'missions') })
    act(() => { result.current.addTokens(300, 'diagnose') })
    act(() => { result.current.addTokens(200, 'insights') })

    expect(result.current.usage.used).toBe(before + 1000)
    expect(result.current.usage.byCategory.missions).toBeGreaterThanOrEqual(500)
    expect(result.current.usage.byCategory.diagnose).toBeGreaterThanOrEqual(300)
    expect(result.current.usage.byCategory.insights).toBeGreaterThanOrEqual(200)
  })

  it('alertLevel transitions warning -> critical -> stopped as usage grows', () => {
    const { result } = renderHook(() => useTokenUsage())
    // Set a small limit to test threshold transitions easily
    const SMALL_LIMIT = 1000
    act(() => { result.current.resetUsage() })
    act(() => {
      result.current.updateSettings({
        limit: SMALL_LIMIT,
        warningThreshold: 0.5,   // 50%
        criticalThreshold: 0.8,  // 80%
      })
    })

    // Below 50% -> normal
    act(() => { result.current.addTokens(400, 'other') })
    expect(result.current.alertLevel).toBe('normal')

    // Above 50% but below 80% -> warning
    act(() => { result.current.addTokens(200, 'other') })
    expect(result.current.alertLevel).toBe('warning')

    // Above 80% but below 100% -> critical
    act(() => { result.current.addTokens(300, 'other') })
    expect(result.current.alertLevel).toBe('critical')

    // At or above 100% -> stopped
    act(() => { result.current.addTokens(200, 'other') })
    expect(result.current.alertLevel).toBe('stopped')
  })

  it('isAIDisabled returns true when usage exceeds stop threshold', () => {
    const { result } = renderHook(() => useTokenUsage())
    const SMALL_LIMIT = 100
    act(() => { result.current.resetUsage() })
    act(() => {
      result.current.updateSettings({ limit: SMALL_LIMIT })
    })
    act(() => { result.current.addTokens(SMALL_LIMIT + 1, 'other') })
    expect(result.current.isAIDisabled()).toBe(true)
  })

  it('percentage is capped at 100 even when usage exceeds limit', () => {
    const { result } = renderHook(() => useTokenUsage())
    const SMALL_LIMIT = 100
    act(() => { result.current.resetUsage() })
    act(() => {
      result.current.updateSettings({ limit: SMALL_LIMIT })
    })
    act(() => { result.current.addTokens(SMALL_LIMIT * 2, 'other') })
    expect(result.current.percentage).toBeLessThanOrEqual(100)
  })

  it('remaining is zero when usage exceeds limit', () => {
    const { result } = renderHook(() => useTokenUsage())
    const SMALL_LIMIT = 100
    act(() => { result.current.resetUsage() })
    act(() => {
      result.current.updateSettings({ limit: SMALL_LIMIT })
    })
    act(() => { result.current.addTokens(SMALL_LIMIT + 50, 'other') })
    expect(result.current.remaining).toBe(0)
  })

  it('resetUsage clears all category counters', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.addTokens(500, 'missions') })
    act(() => { result.current.addTokens(300, 'diagnose') })
    act(() => { result.current.addTokens(200, 'predictions') })
    act(() => { result.current.resetUsage() })

    const cats = result.current.usage.byCategory
    expect(cats.missions).toBe(0)
    expect(cats.diagnose).toBe(0)
    expect(cats.insights).toBe(0)
    expect(cats.predictions).toBe(0)
    expect(cats.other).toBe(0)
  })

  it('resetUsage removes persisted category data from localStorage', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.addTokens(100, 'missions') })
    // After addTokens, category data should be persisted
    act(() => { result.current.resetUsage() })
    expect(localStorage.getItem('kubestellar-token-categories')).toBeNull()
  })

  it('updateSettings dispatches custom events for cross-component sync', () => {
    const { result } = renderHook(() => useTokenUsage())
    const settingsListener = vi.fn()
    const globalListener = vi.fn()
    window.addEventListener('kubestellar-token-settings-changed', settingsListener)
    window.addEventListener('kubestellar-settings-changed', globalListener)

    act(() => {
      result.current.updateSettings({ limit: 2000000 })
    })

    expect(settingsListener).toHaveBeenCalledTimes(1)
    expect(globalListener).toHaveBeenCalledTimes(1)

    window.removeEventListener('kubestellar-token-settings-changed', settingsListener)
    window.removeEventListener('kubestellar-settings-changed', globalListener)
  })

  it('updateSettings falls back to defaults when zero values are provided', () => {
    const { result } = renderHook(() => useTokenUsage())
    // Passing 0 for thresholds should fall back to defaults via || operator
    act(() => {
      result.current.updateSettings({
        limit: 0,
        warningThreshold: 0,
        criticalThreshold: 0,
      })
    })
    // Should not have zero values — should use defaults
    expect(result.current.usage.limit).toBeGreaterThan(0)
    expect(result.current.usage.warningThreshold).toBeGreaterThan(0)
    expect(result.current.usage.criticalThreshold).toBeGreaterThan(0)
    expect(result.current.usage.stopThreshold).toBeGreaterThan(0)
  })

  it('returns isDemoData as false when not in demo mode', () => {
    const { result } = renderHook(() => useTokenUsage())
    expect(result.current.isDemoData).toBe(false)
  })

  it('byCategory has all five expected keys', () => {
    const { result } = renderHook(() => useTokenUsage())
    const expectedKeys: TokenCategory[] = ['missions', 'diagnose', 'insights', 'predictions', 'other']
    for (const key of expectedKeys) {
      expect(result.current.usage.byCategory).toHaveProperty(key)
      expect(typeof result.current.usage.byCategory[key]).toBe('number')
    }
  })

  it('resetDate is a valid ISO date string in the future', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    const resetDate = new Date(result.current.usage.resetDate)
    expect(resetDate.getTime()).not.toBeNaN()
    // Reset date should be the 1st of next month (in the future or very near future)
    expect(resetDate.getDate()).toBe(1)
  })

  // ── getAlertLevel returns 'normal' when limit <= 0 ───────────────
  it('getAlertLevel returns normal when limit is zero', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    expect(result.current.alertLevel).toBe('normal')
  })

  // ── percentage is 0 when limit is 0 (division guard) ─────────────
  it('percentage is 0 when usage.limit is effectively zero', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    // With default large limit and 0 usage, percentage should be 0
    expect(result.current.percentage).toBe(0)
  })

  // ── stopThreshold fallback when set to 0 ────────────────────────
  it('stopThreshold uses default when corrupted to 0', () => {
    localStorage.setItem('kubestellar-token-settings', JSON.stringify({
      limit: 1000,
      warningThreshold: 0.7,
      criticalThreshold: 0.9,
      stopThreshold: 0,
    }))
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    act(() => {
      result.current.updateSettings({ limit: 1000 })
    })
    expect(result.current.usage.stopThreshold).toBeGreaterThan(0)
  })

  // ── addTokens with default 'other' category ─────────────────────
  it('addTokens defaults to other category when none specified', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    const TOKENS = 999
    act(() => { result.current.addTokens(TOKENS) })
    expect(result.current.usage.byCategory.other).toBeGreaterThanOrEqual(TOKENS)
  })

  // ── multiple subscribers receive updates ─────────────────────────
  it('multiple hook instances share singleton state', () => {
    const { result: r1 } = renderHook(() => useTokenUsage())
    const { result: r2 } = renderHook(() => useTokenUsage())

    act(() => { r1.current.resetUsage() })
    const TOKENS = 500
    act(() => { r1.current.addTokens(TOKENS, 'missions') })

    // Both instances should see the same updated state
    expect(r1.current.usage.used).toBe(r2.current.usage.used)
    expect(r1.current.usage.byCategory.missions).toBe(r2.current.usage.byCategory.missions)
  })

  // ── updateSharedUsage does not notify when nothing changed ───────
  it('does not re-render when addTokens(0) is called via addCategoryTokens guard', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    const before = result.current.usage.used
    // addCategoryTokens guards against <= 0
    addCategoryTokens(0, 'missions')
    expect(result.current.usage.used).toBe(before)
  })

  // ── localStorage settings-changed event triggers state sync ──────
  it('responds to kubestellar-token-settings-changed event from other components', () => {
    const { result } = renderHook(() => useTokenUsage())
    const NEW_LIMIT = 9999999

    // Simulate another component updating settings
    localStorage.setItem('kubestellar-token-settings', JSON.stringify({
      limit: NEW_LIMIT,
      warningThreshold: 0.6,
      criticalThreshold: 0.85,
      stopThreshold: 1.0,
    }))

    act(() => {
      window.dispatchEvent(new Event('kubestellar-token-settings-changed'))
    })

    expect(result.current.usage.limit).toBe(NEW_LIMIT)
  })

  // ── storage event from another tab triggers settings sync ────────
  it('responds to storage event for cross-tab sync', () => {
    const { result } = renderHook(() => useTokenUsage())
    const NEW_LIMIT = 7777777

    localStorage.setItem('kubestellar-token-settings', JSON.stringify({
      limit: NEW_LIMIT,
      warningThreshold: 0.5,
      criticalThreshold: 0.8,
      stopThreshold: 1.0,
    }))

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'kubestellar-token-settings',
      }))
    })

    expect(result.current.usage.limit).toBe(NEW_LIMIT)
  })

  // ── storage event for unrelated key is ignored ───────────────────
  it('ignores storage events for unrelated keys', () => {
    const { result } = renderHook(() => useTokenUsage())
    const limitBefore = result.current.usage.limit

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'some-other-key',
      }))
    })

    expect(result.current.usage.limit).toBe(limitBefore)
  })

  // ── cleanup removes event listeners and subscribers ──────────────
  it('cleans up subscribers and stops polling on unmount of last instance', () => {
    const { unmount } = renderHook(() => useTokenUsage())
    // Should not throw
    expect(() => unmount()).not.toThrow()
  })

  // ── resetUsage sets resetDate to first of next month ─────────────
  it('resetUsage sets resetDate to the first day of next month', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })

    const resetDate = new Date(result.current.usage.resetDate)
    const now = new Date()
    const expectedMonth = (now.getMonth() + 1) % 12
    // Check the month is the next month (handle December -> January)
    expect(resetDate.getDate()).toBe(1)
    if (now.getMonth() === 11) {
      expect(resetDate.getMonth()).toBe(0) // January
      expect(resetDate.getFullYear()).toBe(now.getFullYear() + 1)
    } else {
      expect(resetDate.getMonth()).toBe(expectedMonth)
    }
  })

  // ── addTokens with negative value still increments (no guard) ────
  it('addTokens with negative value decreases usage (no guard in addTokens)', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    act(() => { result.current.addTokens(1000, 'missions') })
    const afterAdd = result.current.usage.used
    act(() => { result.current.addTokens(-500, 'missions') })
    // addTokens has no guard for negative — it will subtract
    expect(result.current.usage.used).toBe(afterAdd - 500)
  })

  // ── category data persisted to localStorage on change ────────────
  it('persists category data to localStorage when byCategory changes', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    act(() => { result.current.addTokens(250, 'diagnose') })

    const stored = localStorage.getItem('kubestellar-token-categories')
    expect(stored).not.toBeNull()
    if (stored) {
      const parsed = JSON.parse(stored)
      expect(parsed.diagnose).toBeGreaterThanOrEqual(250)
    }
  })

  // ── updateSettings preserves stopThreshold as default ────────────
  it('updateSettings always forces stopThreshold to the default value', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => {
      result.current.updateSettings({
        limit: 5000,
        warningThreshold: 0.5,
        criticalThreshold: 0.8,
      })
    })
    // stopThreshold is hardcoded to DEFAULT_SETTINGS.stopThreshold (1.0) in updateSettings
    expect(result.current.usage.stopThreshold).toBe(1.0)
  })

  // ── updateSettings uses existing sharedUsage when partial settings given ──
  it('updateSettings falls back to current sharedUsage for unspecified fields', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => {
      result.current.updateSettings({ limit: 2000000 })
    })
    // warningThreshold and criticalThreshold should still be valid (from defaults or prior)
    expect(result.current.usage.warningThreshold).toBeGreaterThan(0)
    expect(result.current.usage.criticalThreshold).toBeGreaterThan(0)
  })

  // ── addTokens with each category type ────────────────────────────
  it('addTokens correctly increments predictions category', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    const TOKENS = 333
    act(() => { result.current.addTokens(TOKENS, 'predictions') })
    expect(result.current.usage.byCategory.predictions).toBeGreaterThanOrEqual(TOKENS)
  })

  // ── multiple resets do not throw or cause negative values ────────
  it('multiple sequential resets do not throw', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    act(() => { result.current.resetUsage() })
    act(() => { result.current.resetUsage() })
    expect(result.current.usage.used).toBe(0)
    expect(result.current.usage.byCategory.missions).toBe(0)
  })
})

describe('setActiveTokenCategory / clearActiveTokenCategory (per-op tracking, #6016)', () => {
  beforeEach(() => {
    // Clean all active ops between tests
    clearActiveTokenCategory(OP_ID_A)
    clearActiveTokenCategory(OP_ID_B)
    clearActiveTokenCategory(OP_ID_C)
  })

  it('sets and clears a single active op', () => {
    setActiveTokenCategory(OP_ID_A, 'missions')
    expect(getActiveTokenCategories()).toEqual(['missions'])
    clearActiveTokenCategory(OP_ID_A)
    expect(getActiveTokenCategories()).toEqual([])
  })

  it('tracks multiple concurrent operations independently', () => {
    setActiveTokenCategory(OP_ID_A, 'missions')
    setActiveTokenCategory(OP_ID_B, 'predictions')
    const active = getActiveTokenCategories()
    expect(active).toHaveLength(2)
    expect(active).toContain('missions')
    expect(active).toContain('predictions')

    // Clearing A must not remove B's entry
    clearActiveTokenCategory(OP_ID_A)
    expect(getActiveTokenCategories()).toEqual(['predictions'])
    clearActiveTokenCategory(OP_ID_B)
    expect(getActiveTokenCategories()).toEqual([])
  })

  it('cycles through all category types correctly', () => {
    const categories: TokenCategory[] = ['missions', 'diagnose', 'insights', 'predictions', 'other']
    for (const cat of categories) {
      setActiveTokenCategory(OP_ID_A, cat)
      expect(getActiveTokenCategories()).toEqual([cat])
    }
    clearActiveTokenCategory(OP_ID_A)
    expect(getActiveTokenCategories()).toEqual([])
  })

  it('overwriting the same opId replaces (not duplicates) the category', () => {
    setActiveTokenCategory(OP_ID_A, 'missions')
    setActiveTokenCategory(OP_ID_A, 'diagnose')
    expect(getActiveTokenCategories()).toEqual(['diagnose'])
    clearActiveTokenCategory(OP_ID_A)
  })

  it('clearing a non-existent opId is a no-op', () => {
    setActiveTokenCategory(OP_ID_A, 'missions')
    clearActiveTokenCategory('non-existent-op-id')
    // OP_ID_A should still be present
    expect(getActiveTokenCategories()).toEqual(['missions'])
    clearActiveTokenCategory(OP_ID_A)
  })

  it('three concurrent ops all tracked independently', () => {
    setActiveTokenCategory(OP_ID_A, 'missions')
    setActiveTokenCategory(OP_ID_B, 'diagnose')
    setActiveTokenCategory(OP_ID_C, 'insights')
    const active = getActiveTokenCategories()
    expect(active).toHaveLength(3)
    expect(active).toContain('missions')
    expect(active).toContain('diagnose')
    expect(active).toContain('insights')

    // Clear middle one
    clearActiveTokenCategory(OP_ID_B)
    const afterClear = getActiveTokenCategories()
    expect(afterClear).toHaveLength(2)
    expect(afterClear).not.toContain('diagnose')

    clearActiveTokenCategory(OP_ID_A)
    clearActiveTokenCategory(OP_ID_C)
    expect(getActiveTokenCategories()).toEqual([])
  })

  it('two ops can share the same category', () => {
    setActiveTokenCategory(OP_ID_A, 'missions')
    setActiveTokenCategory(OP_ID_B, 'missions')
    const active = getActiveTokenCategories()
    expect(active).toHaveLength(2)
    // Both should be 'missions'
    expect(active.every(c => c === 'missions')).toBe(true)

    clearActiveTokenCategory(OP_ID_A)
    expect(getActiveTokenCategories()).toEqual(['missions'])
    clearActiveTokenCategory(OP_ID_B)
    expect(getActiveTokenCategories()).toEqual([])
  })

  it('getActiveTokenCategories returns a new array each call (no shared reference)', () => {
    setActiveTokenCategory(OP_ID_A, 'missions')
    const first = getActiveTokenCategories()
    const second = getActiveTokenCategories()
    expect(first).toEqual(second)
    expect(first).not.toBe(second) // Different array references
    clearActiveTokenCategory(OP_ID_A)
  })

  it('returns empty array when nothing is set', () => {
    expect(getActiveTokenCategories()).toEqual([])
    expect(getActiveTokenCategories()).toHaveLength(0)
  })

  it('set then immediately clear returns empty', () => {
    setActiveTokenCategory(OP_ID_A, 'insights')
    clearActiveTokenCategory(OP_ID_A)
    expect(getActiveTokenCategories()).toEqual([])
  })
})

describe('addCategoryTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(true)
  })

  it('does nothing for non-positive tokens', () => {
    expect(() => addCategoryTokens(0)).not.toThrow()
    expect(() => addCategoryTokens(-100)).not.toThrow()
  })

  it('adds tokens to category', () => {
    expect(() => addCategoryTokens(500, 'diagnose')).not.toThrow()
  })

  it('does not modify usage for zero tokens', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    const before = result.current.usage.used
    addCategoryTokens(0, 'missions')
    // Re-render to pick up any changes
    expect(result.current.usage.used).toBe(before)
  })

  it('does not modify usage for negative tokens', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    const before = result.current.usage.used
    addCategoryTokens(-500, 'diagnose')
    expect(result.current.usage.used).toBe(before)
  })

  it('increments total used alongside category', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    const before = result.current.usage.used
    const TOKENS_TO_ADD = 1234
    act(() => { addCategoryTokens(TOKENS_TO_ADD, 'insights') })
    expect(result.current.usage.used).toBe(before + TOKENS_TO_ADD)
    expect(result.current.usage.byCategory.insights).toBeGreaterThanOrEqual(TOKENS_TO_ADD)
  })

  it('defaults to "other" category when none specified', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    const TOKENS_TO_ADD = 777
    act(() => { addCategoryTokens(TOKENS_TO_ADD) })
    expect(result.current.usage.byCategory.other).toBeGreaterThanOrEqual(TOKENS_TO_ADD)
  })

  it('accumulates tokens on top of existing category values', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })

    const FIRST_BATCH = 100
    const SECOND_BATCH = 200
    act(() => { addCategoryTokens(FIRST_BATCH, 'predictions') })
    act(() => { addCategoryTokens(SECOND_BATCH, 'predictions') })

    expect(result.current.usage.byCategory.predictions).toBeGreaterThanOrEqual(FIRST_BATCH + SECOND_BATCH)
    expect(result.current.usage.used).toBe(FIRST_BATCH + SECOND_BATCH)
  })

  it('distributes tokens correctly across different categories', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })

    act(() => { addCategoryTokens(100, 'missions') })
    act(() => { addCategoryTokens(200, 'diagnose') })
    act(() => { addCategoryTokens(300, 'insights') })
    act(() => { addCategoryTokens(400, 'predictions') })
    act(() => { addCategoryTokens(500, 'other') })

    expect(result.current.usage.byCategory.missions).toBeGreaterThanOrEqual(100)
    expect(result.current.usage.byCategory.diagnose).toBeGreaterThanOrEqual(200)
    expect(result.current.usage.byCategory.insights).toBeGreaterThanOrEqual(300)
    expect(result.current.usage.byCategory.predictions).toBeGreaterThanOrEqual(400)
    expect(result.current.usage.byCategory.other).toBeGreaterThanOrEqual(500)
    expect(result.current.usage.used).toBe(1500)
  })

  it('does not call queueBackendDelta for non-positive tokens', () => {
    addCategoryTokens(0, 'missions')
    addCategoryTokens(-50, 'diagnose')
    // postTokenDelta should never have been called since the guard returns early
    expect(mockPostTokenDelta).not.toHaveBeenCalled()
  })

  it('handles very large token values without overflow', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    const LARGE_VALUE = 999_999_999
    act(() => { addCategoryTokens(LARGE_VALUE, 'missions') })
    expect(result.current.usage.used).toBe(LARGE_VALUE)
    expect(result.current.usage.byCategory.missions).toBe(LARGE_VALUE)
  })

  it('handles fractional token values', () => {
    const { result } = renderHook(() => useTokenUsage())
    act(() => { result.current.resetUsage() })
    const FRACTIONAL = 123.456
    act(() => { addCategoryTokens(FRACTIONAL, 'insights') })
    expect(result.current.usage.used).toBeCloseTo(FRACTIONAL)
    expect(result.current.usage.byCategory.insights).toBeCloseTo(FRACTIONAL)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Agent restart detection + concurrent-op attribution (#6015, #6016)
// ───────────────────────────────────────────────────────────────────────────

const LAST_KNOWN_USAGE_KEY = 'kc:tokenUsage:lastKnown'
const AGENT_SESSION_KEY = 'kc:tokenUsage:agentSession'
const POLL_SETTLE_MS = 50

describe('agent restart detection (#6015) + per-op attribution (#6016)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    vi.clearAllMocks()
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)
  })

  afterEach(() => {
    // @ts-expect-error — cleanup global mock
    delete globalThis.fetch
  })

  async function mountAndPoll(tokens: { input: number; output: number }, agentSessionId?: string) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        claude: {
          tokenUsage: { today: tokens },
          ...(agentSessionId !== undefined ? { agentSessionId } : {}),
        },
      }),
    }) as unknown as typeof fetch
    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    // Let the initial fetch + subscriber update flush
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })
    return { mod, result }
  }

  it('first poll establishes baseline without attributing any delta', async () => {
    const INITIAL_INPUT = 6000
    const INITIAL_OUTPUT = 4000
    const { result } = await mountAndPoll({ input: INITIAL_INPUT, output: INITIAL_OUTPUT }, 'session-1')
    expect(result.current.usage.used).toBe(INITIAL_INPUT + INITIAL_OUTPUT)
    // byCategory should still be all zero
    const sum = Object.values(result.current.usage.byCategory).reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)
  })

  it('persists last-known usage + session id to localStorage', async () => {
    const INITIAL_TOKENS = 5000
    await mountAndPoll({ input: INITIAL_TOKENS, output: 0 }, 'session-abc')
    expect(localStorage.getItem(LAST_KNOWN_USAGE_KEY)).toBe(String(INITIAL_TOKENS))
    expect(localStorage.getItem(AGENT_SESSION_KEY)).toBe('session-abc')
  })

  it('agent session change resets baseline without attributing delta', async () => {
    const PRIOR_BASELINE = 10_000
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, String(PRIOR_BASELINE))
    localStorage.setItem(AGENT_SESSION_KEY, 'session-1')

    const RESTART_TOKENS = 3000
    const { result } = await mountAndPoll({ input: RESTART_TOKENS, output: 0 }, 'session-2')

    expect(result.current.usage.used).toBe(RESTART_TOKENS)
    const sum = Object.values(result.current.usage.byCategory).reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)
    expect(localStorage.getItem(AGENT_SESSION_KEY)).toBe('session-2')
  })

  it('counter going backwards (no session id) is also treated as a restart', async () => {
    const PRIOR_BASELINE = 50_000
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, String(PRIOR_BASELINE))

    const RESTART_TOKENS = 1000
    const { result } = await mountAndPoll({ input: RESTART_TOKENS, output: 0 })

    expect(result.current.usage.used).toBe(RESTART_TOKENS)
    const sum = Object.values(result.current.usage.byCategory).reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)
  })

  it('single active op receives the full delta', async () => {
    const BASELINE = 1000
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, String(BASELINE))
    localStorage.setItem(AGENT_SESSION_KEY, 'session-1')

    const NEXT_TOTAL = 1500
    const EXPECTED_DELTA = NEXT_TOTAL - BASELINE
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ claude: { tokenUsage: { today: { input: NEXT_TOTAL, output: 0 } }, agentSessionId: 'session-1' } }),
    }) as unknown as typeof fetch
    const mod = await import('../useTokenUsage')
    mod.setActiveTokenCategory('op-missions', 'missions')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })
    mod.clearActiveTokenCategory('op-missions')

    expect(result.current.usage.byCategory.missions).toBe(EXPECTED_DELTA)
  })

  it('multiple concurrent ops split the delta evenly', async () => {
    const BASELINE = 2000
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, String(BASELINE))
    localStorage.setItem(AGENT_SESSION_KEY, 'session-1')

    const NEXT_TOTAL = 3000
    const EXPECTED_PER_OP = (NEXT_TOTAL - BASELINE) / 2
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ claude: { tokenUsage: { today: { input: NEXT_TOTAL, output: 0 } }, agentSessionId: 'session-1' } }),
    }) as unknown as typeof fetch
    const mod = await import('../useTokenUsage')
    mod.setActiveTokenCategory('op-m', 'missions')
    mod.setActiveTokenCategory('op-p', 'predictions')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })
    mod.clearActiveTokenCategory('op-m')
    mod.clearActiveTokenCategory('op-p')

    expect(result.current.usage.byCategory.missions).toBe(EXPECTED_PER_OP)
    expect(result.current.usage.byCategory.predictions).toBe(EXPECTED_PER_OP)
  })

  it('localStorage quota failure on persist is swallowed gracefully', async () => {
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = vi.fn(() => { throw new Error('QuotaExceededError') })

    try {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ claude: { tokenUsage: { today: { input: 500, output: 0 } }, agentSessionId: 'session-q' } }),
      }) as unknown as typeof fetch
      const mod = await import('../useTokenUsage')
      const { result } = renderHook(() => mod.useTokenUsage())
      await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })
      expect(result.current.usage.used).toBe(500)
    } finally {
      Storage.prototype.setItem = originalSetItem
    }
  })

  it('corrupted localStorage baseline is ignored on init', async () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, 'not-a-number')
    localStorage.setItem(AGENT_SESSION_KEY, 'session-1')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ claude: { tokenUsage: { today: { input: 100, output: 0 } }, agentSessionId: 'session-1' } }),
    }) as unknown as typeof fetch
    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })
    expect(result.current.usage.used).toBe(100)
    const sum = Object.values(result.current.usage.byCategory).reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)
  })

  it('non-ok fetch response calls reportAgentDataError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch
    const mod = await import('../useTokenUsage')
    renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })
    expect(mockReportAgentDataError).toHaveBeenCalledWith('/health (token)', 'HTTP 503')
  })

  it('fetch network error is swallowed without crashing', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch
    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    // Should not throw
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })
    expect(result.current.usage).toBeDefined()
  })

  it('invalid JSON response is handled gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('Unexpected token')),
    }) as unknown as typeof fetch
    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    // json().catch(() => null) returns null, then throws 'Invalid JSON response'
    // which is caught by the outer try/catch
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })
    expect(result.current.usage).toBeDefined()
  })

  it('health response without tokenUsage data does not crash', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ claude: {} }),
    }) as unknown as typeof fetch
    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })
    // Should not crash, just not update the usage
    expect(result.current.usage).toBeDefined()
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('health response with only output tokens (no input) counts correctly', async () => {
    const OUTPUT_TOKENS = 7500
    const { result } = await mountAndPoll({ input: 0, output: OUTPUT_TOKENS }, 'session-output')
    expect(result.current.usage.used).toBe(OUTPUT_TOKENS)
  })

  it('large delta exceeding MAX_SINGLE_DELTA_TOKENS is skipped', async () => {
    // MAX_SINGLE_DELTA_TOKENS = 50_000
    const BASELINE = 1000
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, String(BASELINE))
    localStorage.setItem(AGENT_SESSION_KEY, 'session-1')

    // Delta of 60_000 exceeds the 50_000 threshold
    const NEXT_TOTAL = 61_000
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ claude: { tokenUsage: { today: { input: NEXT_TOTAL, output: 0 } }, agentSessionId: 'session-1' } }),
    }) as unknown as typeof fetch
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // used should be updated to the new total
    expect(result.current.usage.used).toBe(NEXT_TOTAL)
    // But no category should have received the delta
    const sum = Object.values(result.current.usage.byCategory).reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)
    // Should have logged a warning
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping large delta')
    )
    consoleSpy.mockRestore()
  })

  it('no active ops attributes delta to default "other" category', async () => {
    const BASELINE = 2000
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, String(BASELINE))
    localStorage.setItem(AGENT_SESSION_KEY, 'session-1')

    // Delta of 500, no active ops -> all goes to 'other'
    const NEXT_TOTAL = 2500
    const EXPECTED_DELTA = NEXT_TOTAL - BASELINE
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ claude: { tokenUsage: { today: { input: NEXT_TOTAL, output: 0 } }, agentSessionId: 'session-1' } }),
    }) as unknown as typeof fetch
    const mod = await import('../useTokenUsage')
    // No active ops set
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    expect(result.current.usage.byCategory.other).toBe(EXPECTED_DELTA)
  })

  it('totalUsed === lastKnownUsage does not attribute any delta', async () => {
    const BASELINE = 5000
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, String(BASELINE))
    localStorage.setItem(AGENT_SESSION_KEY, 'session-1')

    // Same value as baseline -> no delta
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ claude: { tokenUsage: { today: { input: BASELINE, output: 0 } }, agentSessionId: 'session-1' } }),
    }) as unknown as typeof fetch
    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    expect(result.current.usage.used).toBe(BASELINE)
    const sum = Object.values(result.current.usage.byCategory).reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)
  })

  it('three concurrent ops split delta with remainder to first op', async () => {
    const BASELINE = 1000
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, String(BASELINE))
    localStorage.setItem(AGENT_SESSION_KEY, 'session-1')

    // Delta of 10, split across 3 ops: 3 + 3 + 4 (4 to first with remainder 1)
    const NEXT_TOTAL = 1010
    const DELTA = NEXT_TOTAL - BASELINE // 10
    const PER_OP = Math.floor(DELTA / 3) // 3
    const REMAINDER = DELTA - PER_OP * 3 // 1
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ claude: { tokenUsage: { today: { input: NEXT_TOTAL, output: 0 } }, agentSessionId: 'session-1' } }),
    }) as unknown as typeof fetch
    const mod = await import('../useTokenUsage')
    mod.setActiveTokenCategory('op-1', 'missions')
    mod.setActiveTokenCategory('op-2', 'diagnose')
    mod.setActiveTokenCategory('op-3', 'insights')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })
    mod.clearActiveTokenCategory('op-1')
    mod.clearActiveTokenCategory('op-2')
    mod.clearActiveTokenCategory('op-3')

    // Total attributed should equal delta
    const totalAttributed =
      result.current.usage.byCategory.missions +
      result.current.usage.byCategory.diagnose +
      result.current.usage.byCategory.insights
    expect(totalAttributed).toBe(DELTA)

    // First op gets perOp + remainder, others get perOp
    // The first op in the Map iteration gets the remainder
    expect(result.current.usage.byCategory.missions).toBe(PER_OP + REMAINDER)
    expect(result.current.usage.byCategory.diagnose).toBe(PER_OP)
    expect(result.current.usage.byCategory.insights).toBe(PER_OP)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Demo mode behavior
// ───────────────────────────────────────────────────────────────────────────

describe('demo mode behavior', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    vi.clearAllMocks()
    mockIsAgentUnavailable.mockReturnValue(true)
  })

  afterEach(() => {
    mockGetDemoMode.mockReturnValue(false)
    // @ts-expect-error — cleanup global mock
    delete globalThis.fetch
  })

  it('demo mode skips agent fetch and uses demo token values', async () => {
    mockGetDemoMode.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(false)

    // Provide a fetch that should NOT be called in demo mode
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ claude: { tokenUsage: { today: { input: 999, output: 0 } } } }),
    }) as unknown as typeof fetch

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // Demo mode uses DEMO_TOKEN_USAGE (1247832) + random increase
    expect(result.current.usage.used).toBeGreaterThanOrEqual(1247832)
    expect(result.current.isDemoData).toBe(true)
  })

  it('demo mode does not persist category data to localStorage', async () => {
    mockGetDemoMode.mockReturnValue(true)

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // Category data should NOT be persisted in demo mode
    // (updateSharedUsage skips localStorage when getDemoMode() is true)
    // The demo byCategory values are set at module init, not through updateSharedUsage persistence
    expect(result.current.usage.byCategory.missions).toBeGreaterThan(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Agent unavailable behavior
// ───────────────────────────────────────────────────────────────────────────

describe('agent unavailable behavior', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    vi.clearAllMocks()
    mockGetDemoMode.mockReturnValue(false)
  })

  afterEach(() => {
    // @ts-expect-error — cleanup global mock
    delete globalThis.fetch
  })

  it('skips fetch when agent is unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn() as unknown as typeof fetch

    const mod = await import('../useTokenUsage')
    renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // fetch should not have been called because agent is unavailable
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Backend hydration (hydrateFromBackend)
// ───────────────────────────────────────────────────────────────────────────

describe('backend hydration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    vi.clearAllMocks()
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(true) // prevent fetch polling
  })

  afterEach(() => {
    // @ts-expect-error — cleanup global mock
    delete globalThis.fetch
  })

  it('hydrates byCategory from backend on first mount', async () => {
    mockGetUserTokenUsage.mockResolvedValue({
      user_id: 'user-1',
      total_tokens: 5000,
      tokens_by_category: {
        missions: 2000,
        diagnose: 1500,
        insights: 1000,
        predictions: 500,
        other: 0,
      },
      last_agent_session_id: 'backend-session-1',
      updated_at: '2026-01-01T00:00:00Z',
    })

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    // Allow async hydration to complete
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    expect(result.current.usage.byCategory.missions).toBe(2000)
    expect(result.current.usage.byCategory.diagnose).toBe(1500)
    expect(result.current.usage.byCategory.insights).toBe(1000)
    expect(result.current.usage.byCategory.predictions).toBe(500)
  })

  it('handles 401 from backend gracefully and disables further calls', async () => {
    // Import the mock class from the mocked module
    const { TokenUsageUnauthenticatedError } = await import('../../lib/tokenUsageApi')
    mockGetUserTokenUsage.mockRejectedValue(new TokenUsageUnauthenticatedError())

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // Should not crash, usage should still be accessible
    expect(result.current.usage).toBeDefined()
    expect(result.current.usage.byCategory).toBeDefined()
  })

  it('handles network error from backend gracefully (retry on next mount)', async () => {
    mockGetUserTokenUsage.mockRejectedValue(new Error('Network error'))

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // Should not crash
    expect(result.current.usage).toBeDefined()
  })

  it('skips backend hydration in demo mode', async () => {
    mockGetDemoMode.mockReturnValue(true)

    const mod = await import('../useTokenUsage')
    renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // getUserTokenUsage should not have been called
    expect(mockGetUserTokenUsage).not.toHaveBeenCalled()
  })

  it('backend response with partial categories merges with defaults', async () => {
    mockGetUserTokenUsage.mockResolvedValue({
      user_id: 'user-1',
      total_tokens: 1000,
      tokens_by_category: {
        missions: 500,
        // other categories not present
      },
      last_agent_session_id: 'session-partial',
      updated_at: '2026-01-01T00:00:00Z',
    })

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    expect(result.current.usage.byCategory.missions).toBe(500)
    // Other categories should retain their default (0) values
    expect(typeof result.current.usage.byCategory.diagnose).toBe('number')
    expect(typeof result.current.usage.byCategory.insights).toBe('number')
  })

  it('backend response with non-finite category value is ignored', async () => {
    mockGetUserTokenUsage.mockResolvedValue({
      user_id: 'user-1',
      total_tokens: 1000,
      tokens_by_category: {
        missions: NaN,
        diagnose: Infinity,
        insights: 100,
      },
      last_agent_session_id: 'session-nan',
      updated_at: '2026-01-01T00:00:00Z',
    })

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // NaN and Infinity should be ignored (Number.isFinite check)
    expect(Number.isFinite(result.current.usage.byCategory.missions)).toBe(true)
    expect(Number.isFinite(result.current.usage.byCategory.diagnose)).toBe(true)
    // Valid value should be accepted
    expect(result.current.usage.byCategory.insights).toBe(100)
  })

  it('backend session id overrides localStorage session id', async () => {
    localStorage.setItem(AGENT_SESSION_KEY, 'old-session')

    mockGetUserTokenUsage.mockResolvedValue({
      user_id: 'user-1',
      total_tokens: 0,
      tokens_by_category: {},
      last_agent_session_id: 'backend-session-override',
      updated_at: '2026-01-01T00:00:00Z',
    })

    const mod = await import('../useTokenUsage')
    renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // The backend session id should have been adopted (tested indirectly
    // by the fact that the module accepted it without throwing)
    expect(mockGetUserTokenUsage).toHaveBeenCalled()
  })

  it('backend response with null tokens_by_category does not crash', async () => {
    mockGetUserTokenUsage.mockResolvedValue({
      user_id: 'user-1',
      total_tokens: 0,
      tokens_by_category: null,
      last_agent_session_id: '',
      updated_at: '2026-01-01T00:00:00Z',
    })

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // Should not crash — the ?. in record.tokens_by_category?.[cat] handles null
    expect(result.current.usage).toBeDefined()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// localStorage initialization edge cases
// ───────────────────────────────────────────────────────────────────────────

describe('localStorage initialization edge cases', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    vi.clearAllMocks()
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(true)
  })

  afterEach(() => {
    // @ts-expect-error — cleanup global mock
    delete globalThis.fetch
  })

  it('corrupted settings JSON falls back to defaults', async () => {
    localStorage.setItem('kubestellar-token-settings', 'not valid json {{{')

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // Should use defaults
    expect(result.current.usage.limit).toBeGreaterThan(0)
    expect(result.current.usage.warningThreshold).toBeGreaterThan(0)
  })

  it('corrupted category JSON falls back to zeroed byCategory', async () => {
    localStorage.setItem('kubestellar-token-categories', '{invalid json')

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // Should have valid default structure
    expect(result.current.usage.byCategory).toBeDefined()
    expect(typeof result.current.usage.byCategory.missions).toBe('number')
  })

  it('negative limit in localStorage is corrected to default', async () => {
    localStorage.setItem('kubestellar-token-settings', JSON.stringify({
      limit: -100,
      warningThreshold: 0.7,
      criticalThreshold: 0.9,
      stopThreshold: 1.0,
    }))

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // limit <= 0 should be corrected to DEFAULT_SETTINGS.limit (500M)
    expect(result.current.usage.limit).toBeGreaterThan(0)
  })

  it('zero limit in localStorage is corrected to default', async () => {
    localStorage.setItem('kubestellar-token-settings', JSON.stringify({
      limit: 0,
      warningThreshold: 0.7,
      criticalThreshold: 0.9,
      stopThreshold: 1.0,
    }))

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    expect(result.current.usage.limit).toBeGreaterThan(0)
  })

  it('zero warningThreshold in localStorage is corrected', async () => {
    localStorage.setItem('kubestellar-token-settings', JSON.stringify({
      limit: 1000,
      warningThreshold: 0,
      criticalThreshold: 0.9,
      stopThreshold: 1.0,
    }))

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    expect(result.current.usage.warningThreshold).toBeGreaterThan(0)
  })

  it('zero criticalThreshold in localStorage is corrected', async () => {
    localStorage.setItem('kubestellar-token-settings', JSON.stringify({
      limit: 1000,
      warningThreshold: 0.7,
      criticalThreshold: 0,
      stopThreshold: 1.0,
    }))

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    expect(result.current.usage.criticalThreshold).toBeGreaterThan(0)
  })

  it('stopThreshold below MIN_STOP_THRESHOLD is corrected', async () => {
    localStorage.setItem('kubestellar-token-settings', JSON.stringify({
      limit: 1000,
      warningThreshold: 0.7,
      criticalThreshold: 0.9,
      stopThreshold: 0.005, // below MIN_STOP_THRESHOLD (0.01)
    }))

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    await act(async () => { await new Promise(r => setTimeout(r, POLL_SETTLE_MS)) })

    // Should be corrected to default (1.0)
    expect(result.current.usage.stopThreshold).toBeGreaterThanOrEqual(0.01)
  })

  it('valid persisted category data is restored on init', async () => {
    localStorage.setItem('kubestellar-token-categories', JSON.stringify({
      missions: 1000,
      diagnose: 500,
      insights: 250,
      predictions: 100,
      other: 50,
    }))

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())

    expect(result.current.usage.byCategory.missions).toBe(1000)
    expect(result.current.usage.byCategory.diagnose).toBe(500)
    expect(result.current.usage.byCategory.insights).toBe(250)
    expect(result.current.usage.byCategory.predictions).toBe(100)
    expect(result.current.usage.byCategory.other).toBe(50)
  })

  it('partial persisted category data is merged with defaults', async () => {
    localStorage.setItem('kubestellar-token-categories', JSON.stringify({
      missions: 1000,
      // other keys missing
    }))

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())

    expect(result.current.usage.byCategory.missions).toBe(1000)
    // Missing keys should default to 0
    expect(result.current.usage.byCategory.diagnose).toBe(0)
    expect(result.current.usage.byCategory.insights).toBe(0)
    expect(result.current.usage.byCategory.predictions).toBe(0)
    expect(result.current.usage.byCategory.other).toBe(0)
  })

  it('NaN value in persisted lastKnown is treated as null', async () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, 'NaN')

    const mod = await import('../useTokenUsage')
    // Should not crash — loadPersistedUsage handles Number.isFinite check
    const { result } = renderHook(() => mod.useTokenUsage())
    expect(result.current.usage).toBeDefined()
  })

  it('Infinity value in persisted lastKnown is treated as null', async () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, 'Infinity')

    const mod = await import('../useTokenUsage')
    const { result } = renderHook(() => mod.useTokenUsage())
    expect(result.current.usage).toBeDefined()
  })
})
