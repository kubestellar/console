/**
 * Tests for hooks/version/usePersistedState.ts
 *
 * Covers the localStorage-backed state hook. 0% line coverage before this PR
 * as no test or production file imports the module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePersistedState } from '../usePersistedState'

// ---------------------------------------------------------------------------
// localStorage stub (jsdom provides a real one; we spy on it for clarity)
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Default value resolution
// ---------------------------------------------------------------------------

describe('usePersistedState — initialisation', () => {
  it('returns defaultValue when localStorage is empty', () => {
    const { result } = renderHook(() => usePersistedState('key-a', 42))
    expect(result.current[0]).toBe(42)
  })

  it('accepts a factory function as defaultValue', () => {
    const { result } = renderHook(() => usePersistedState('key-factory', () => 'from-factory'))
    expect(result.current[0]).toBe('from-factory')
  })

  it('hydrates from existing localStorage JSON', () => {
    localStorage.setItem('key-hydrate', JSON.stringify({ count: 7 }))
    const { result } = renderHook(() =>
      usePersistedState('key-hydrate', { count: 0 }),
    )
    expect(result.current[0]).toEqual({ count: 7 })
  })

  it('falls back to defaultValue when stored JSON is malformed', () => {
    localStorage.setItem('key-bad-json', '{broken')
    const { result } = renderHook(() => usePersistedState('key-bad-json', 'fallback'))
    expect(result.current[0]).toBe('fallback')
  })

  it('uses custom deserialize option when provided', () => {
    localStorage.setItem('key-deser', '42')
    const { result } = renderHook(() =>
      usePersistedState('key-deser', 0, { deserialize: (raw) => Number(raw) * 2 }),
    )
    expect(result.current[0]).toBe(84)
  })
})

// ---------------------------------------------------------------------------
// State updates and persistence
// ---------------------------------------------------------------------------

describe('usePersistedState — updates', () => {
  it('persists new value to localStorage on set', () => {
    const { result } = renderHook(() => usePersistedState('key-set', 0))
    act(() => result.current[1](99))
    expect(result.current[0]).toBe(99)
    expect(JSON.parse(localStorage.getItem('key-set')!)).toBe(99)
  })

  it('supports functional updates', () => {
    const { result } = renderHook(() => usePersistedState('key-fn', 10))
    act(() => result.current[1]((prev) => prev + 5))
    expect(result.current[0]).toBe(15)
  })

  it('uses custom serialize option when provided', () => {
    const { result } = renderHook(() =>
      usePersistedState('key-ser', 0, { serialize: (v) => `custom:${v}` }),
    )
    act(() => result.current[1](7))
    expect(localStorage.getItem('key-ser')).toBe('custom:7')
  })

  it('removes key when removeWhen predicate returns true', () => {
    localStorage.setItem('key-remove', JSON.stringify('present'))
    const { result } = renderHook(() =>
      usePersistedState('key-remove', '', { removeWhen: (v) => v === '' }),
    )
    act(() => result.current[1](''))
    expect(localStorage.getItem('key-remove')).toBeNull()
  })

  it('keeps in-memory state when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const { result } = renderHook(() => usePersistedState('key-quota', 1))
    act(() => result.current[1](2))
    // state still updated in memory even though persistence failed
    expect(result.current[0]).toBe(2)
  })
})
