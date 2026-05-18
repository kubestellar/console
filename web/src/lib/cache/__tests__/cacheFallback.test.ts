/**
 * Tests for lib/cache/cacheFallback.ts
 *
 * Directly targets isEquivalentToInitial and resolveDemoDisplayState which
 * are used by cacheCore but may lack branch coverage in cacheCore-focused tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../demoMode', () => ({
  isDemoMode: vi.fn(() => false),
  subscribeDemoMode: vi.fn(() => () => {}),
}))
vi.mock('../../modeTransition', () => ({
  registerCacheReset: vi.fn(),
}))

import { isEquivalentToInitial, resolveDemoDisplayState, registerCacheModeReset } from '../cacheFallback'
import { registerCacheReset } from '../../modeTransition'
import type { CacheState } from '../cacheStorage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState<T>(data: T, overrides: Partial<CacheState<T>> = {}): CacheState<T> {
  return {
    data,
    isLoading: false,
    isRefreshing: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// isEquivalentToInitial
// ---------------------------------------------------------------------------

describe('isEquivalentToInitial', () => {
  it('returns true for null/null', () => {
    expect(isEquivalentToInitial(null, null)).toBe(true)
  })

  it('returns true for both empty arrays', () => {
    expect(isEquivalentToInitial([], [])).toBe(true)
  })

  it('returns false when arrays differ in length', () => {
    expect(isEquivalentToInitial([1], [])).toBe(false)
  })

  it('returns false when newData is non-empty array', () => {
    expect(isEquivalentToInitial(['x'], [])).toBe(false)
  })

  it('returns true for identical plain objects', () => {
    expect(isEquivalentToInitial({ a: 1 }, { a: 1 })).toBe(true)
  })

  it('returns false for differing objects', () => {
    expect(isEquivalentToInitial({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('returns false for circular-reference objects (JSON.stringify throws)', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(isEquivalentToInitial(circular, {})).toBe(false)
  })

  it('returns false for primitives that differ', () => {
    expect(isEquivalentToInitial(42 as unknown, 99 as unknown)).toBe(false)
  })

  it('returns false when newData is null but initialData is not', () => {
    expect(isEquivalentToInitial(null, [])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveDemoDisplayState
// ---------------------------------------------------------------------------

describe('resolveDemoDisplayState', () => {
  const liveData = ['live-item']
  const demoData = ['demo-item']
  const initialData: string[] = []

  describe('demo mode disabled (effectiveEnabled=false)', () => {
    it('returns demoData when available', () => {
      const result = resolveDemoDisplayState({
        effectiveEnabled: false,
        state: makeState(liveData),
        stableDemoData: demoData,
        stableInitialData: initialData,
        demoWhenEmpty: false,
        dataIsEmpty: false,
      })
      expect(result.data).toEqual(demoData)
      expect(result.isDemoFallback).toBe(true)
      expect(result.isLoading).toBe(false)
    })

    it('falls back to initialData when stableDemoData is undefined', () => {
      const result = resolveDemoDisplayState({
        effectiveEnabled: false,
        state: makeState(liveData),
        stableDemoData: undefined,
        stableInitialData: initialData,
        demoWhenEmpty: false,
        dataIsEmpty: false,
      })
      expect(result.data).toEqual(initialData)
      expect(result.isDemoFallback).toBe(true)
    })
  })

  describe('demo mode enabled (effectiveEnabled=true)', () => {
    it('returns live state data when fetch succeeded and demoWhenEmpty=false', () => {
      const result = resolveDemoDisplayState({
        effectiveEnabled: true,
        state: makeState(liveData),
        stableDemoData: demoData,
        stableInitialData: initialData,
        demoWhenEmpty: false,
        dataIsEmpty: false,
      })
      expect(result.data).toEqual(liveData)
      expect(result.isDemoFallback).toBe(false)
      expect(result.isLoading).toBe(false)
    })

    it('preserves isLoading from state when not fallback', () => {
      const result = resolveDemoDisplayState({
        effectiveEnabled: true,
        state: makeState(initialData, { isLoading: true }),
        stableDemoData: undefined,
        stableInitialData: initialData,
        demoWhenEmpty: false,
        dataIsEmpty: true,
      })
      expect(result.isLoading).toBe(true)
    })

    it('falls back to demoData when demoWhenEmpty=true, not loading, dataIsEmpty=true', () => {
      const result = resolveDemoDisplayState({
        effectiveEnabled: true,
        state: makeState(initialData, { isLoading: false }),
        stableDemoData: demoData,
        stableInitialData: initialData,
        demoWhenEmpty: true,
        dataIsEmpty: true,
      })
      expect(result.data).toEqual(demoData)
      expect(result.isDemoFallback).toBe(true)
      expect(result.isLoading).toBe(false)
    })

    it('shows optimistic demo when demoWhenEmpty=true, isLoading=true, dataIsEmpty=true', () => {
      const result = resolveDemoDisplayState({
        effectiveEnabled: true,
        state: makeState(initialData, { isLoading: true }),
        stableDemoData: demoData,
        stableInitialData: initialData,
        demoWhenEmpty: true,
        dataIsEmpty: true,
      })
      expect(result.data).toEqual(demoData)
      expect(result.isDemoFallback).toBe(true)
      expect(result.isLoading).toBe(false)
      expect(result.isRefreshing).toBe(true)
    })

    it('does NOT apply optimistic demo when dataIsEmpty=false (warm cache)', () => {
      const result = resolveDemoDisplayState({
        effectiveEnabled: true,
        state: makeState(liveData, { isLoading: true }),
        stableDemoData: demoData,
        stableInitialData: initialData,
        demoWhenEmpty: true,
        dataIsEmpty: false,
      })
      expect(result.data).toEqual(liveData)
      expect(result.isDemoFallback).toBe(false)
    })

    it('passes through state.isRefreshing', () => {
      const result = resolveDemoDisplayState({
        effectiveEnabled: true,
        state: makeState(liveData, { isRefreshing: true }),
        stableDemoData: demoData,
        stableInitialData: initialData,
        demoWhenEmpty: false,
        dataIsEmpty: false,
      })
      expect(result.isRefreshing).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// registerCacheModeReset
// ---------------------------------------------------------------------------

describe('registerCacheModeReset', () => {
  beforeEach(() => {
    vi.mocked(registerCacheReset).mockClear()
  })

  it('calls registerCacheReset with unified-cache key', () => {
    const clear = vi.fn()
    registerCacheModeReset(clear)
    expect(registerCacheReset).toHaveBeenCalledWith('unified-cache', clear)
  })
})
