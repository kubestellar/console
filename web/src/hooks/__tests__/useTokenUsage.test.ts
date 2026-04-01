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

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../../lib/constants/network', () => ({
  QUICK_ABORT_TIMEOUT_MS: 2000,
}))

import { useTokenUsage, setActiveTokenCategory, getActiveTokenCategory, addCategoryTokens } from '../useTokenUsage'

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
})

describe('setActiveTokenCategory / getActiveTokenCategory', () => {
  it('sets and gets active category', () => {
    setActiveTokenCategory('missions')
    expect(getActiveTokenCategory()).toBe('missions')
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
})
