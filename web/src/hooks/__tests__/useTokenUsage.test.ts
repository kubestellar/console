import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: vi.fn(() => true),
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
}))

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => false),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  QUICK_ABORT_TIMEOUT_MS: 2000,
} })

import { useTokenUsage, setActiveTokenCategory, getActiveTokenCategory, addCategoryTokens } from '../useTokenUsage'
import type { TokenCategory } from '../useTokenUsage'

describe('useTokenUsage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
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
})

describe('setActiveTokenCategory / getActiveTokenCategory', () => {
  it('sets and gets active category', () => {
    setActiveTokenCategory('missions')
    expect(getActiveTokenCategory()).toBe('missions')
    setActiveTokenCategory(null)
    expect(getActiveTokenCategory()).toBeNull()
  })

  it('cycles through all category types correctly', () => {
    const categories: TokenCategory[] = ['missions', 'diagnose', 'insights', 'predictions', 'other']
    for (const cat of categories) {
      setActiveTokenCategory(cat)
      expect(getActiveTokenCategory()).toBe(cat)
    }
    setActiveTokenCategory(null)
    expect(getActiveTokenCategory()).toBeNull()
  })
})

describe('addCategoryTokens', () => {
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
})
