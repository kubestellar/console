import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalStorage } from '../useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('initial value', () => {
    it('returns default value when key is absent', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 42))
      expect(result.current[0]).toBe(42)
    })

    it('returns stored value when key exists', () => {
      localStorage.setItem('test-key', JSON.stringify(99))
      const { result } = renderHook(() => useLocalStorage('test-key', 0))
      expect(result.current[0]).toBe(99)
    })

    it('returns default when stored value is invalid JSON', () => {
      localStorage.setItem('test-key', 'not-json{{{')
      const { result } = renderHook(() => useLocalStorage('test-key', 'fallback'))
      expect(result.current[0]).toBe('fallback')
    })

    it('works with object default values', () => {
      const { result } = renderHook(() => useLocalStorage('obj-key', { a: 1 }))
      expect(result.current[0]).toEqual({ a: 1 })
    })

    it('works with array default values', () => {
      const { result } = renderHook(() => useLocalStorage('arr-key', [1, 2, 3]))
      expect(result.current[0]).toEqual([1, 2, 3])
    })

    it('returns stored object when key exists', () => {
      localStorage.setItem('obj-key', JSON.stringify({ x: 'hello' }))
      const { result } = renderHook(() => useLocalStorage('obj-key', { x: '' }))
      expect(result.current[0]).toEqual({ x: 'hello' })
    })
  })

  describe('setter', () => {
    it('updates value with a direct value', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 0))
      act(() => { result.current[1](99) })
      expect(result.current[0]).toBe(99)
    })

    it('updates value with a function updater', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 10))
      act(() => { result.current[1](prev => prev + 5) })
      expect(result.current[0]).toBe(15)
    })

    it('persists new value to localStorage', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 'a'))
      act(() => { result.current[1]('b') })
      expect(localStorage.getItem('test-key')).toBe(JSON.stringify('b'))
    })

    it('setter reference is stable across re-renders', () => {
      const { result, rerender } = renderHook(() => useLocalStorage('test-key', 0))
      const firstSetter = result.current[1]
      rerender()
      expect(result.current[1]).toBe(firstSetter)
    })
  })

  describe('localStorage persistence', () => {
    it('persists initial default to localStorage after mount', () => {
      renderHook(() => useLocalStorage('persist-key', 'hello'))
      expect(localStorage.getItem('persist-key')).toBe(JSON.stringify('hello'))
    })

    it('updates localStorage on every value change', () => {
      const { result } = renderHook(() => useLocalStorage('count-key', 0))
      act(() => { result.current[1](1) })
      expect(localStorage.getItem('count-key')).toBe('1')
      act(() => { result.current[1](2) })
      expect(localStorage.getItem('count-key')).toBe('2')
    })

    it('handles localStorage.setItem quota error silently', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })
      const { result } = renderHook(() => useLocalStorage('quota-key', 'x'))
      expect(() => act(() => { result.current[1]('y') })).not.toThrow()
      expect(result.current[0]).toBe('y')
    })
  })

  describe('cross-tab sync via storage event', () => {
    it('updates value when another tab sets the same key', () => {
      const { result } = renderHook(() => useLocalStorage('sync-key', 'original'))
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'sync-key',
          newValue: JSON.stringify('from-other-tab'),
        }))
      })
      expect(result.current[0]).toBe('from-other-tab')
    })

    it('falls back to default when storage event newValue is null', () => {
      localStorage.setItem('sync-key', JSON.stringify('set'))
      const { result } = renderHook(() => useLocalStorage('sync-key', 'default'))
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'sync-key',
          newValue: null,
        }))
      })
      expect(result.current[0]).toBe('default')
    })

    it('falls back to default when storage event newValue is invalid JSON', () => {
      const { result } = renderHook(() => useLocalStorage('sync-key', 'fallback'))
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'sync-key',
          newValue: 'invalid{{{',
        }))
      })
      expect(result.current[0]).toBe('fallback')
    })

    it('ignores storage events for different keys', () => {
      const { result } = renderHook(() => useLocalStorage('my-key', 'original'))
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'other-key',
          newValue: JSON.stringify('should-not-update'),
        }))
      })
      expect(result.current[0]).toBe('original')
    })

    it('removes the storage event listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const { unmount } = renderHook(() => useLocalStorage('cleanup-key', 0))
      unmount()
      expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function))
    })
  })

  describe('custom serialize / deserialize options', () => {
    it('uses custom serialize when provided', () => {
      const serialize = vi.fn((v: number) => String(v))
      const deserialize = vi.fn((s: string) => parseInt(s, 10))
      const { result } = renderHook(() =>
        useLocalStorage('custom-key', 7, { serialize, deserialize })
      )
      act(() => { result.current[1](42) })
      expect(serialize).toHaveBeenCalledWith(42)
      expect(localStorage.getItem('custom-key')).toBe('42')
    })

    it('uses custom deserialize to read initial stored value', () => {
      localStorage.setItem('custom-key', '123')
      const deserialize = vi.fn((s: string) => parseInt(s, 10) * 2)
      const { result } = renderHook(() =>
        useLocalStorage('custom-key', 0, { deserialize })
      )
      expect(result.current[0]).toBe(246)
    })
  })

  describe('boolean values', () => {
    it('reads false from storage correctly', () => {
      localStorage.setItem('bool-key', JSON.stringify(false))
      const { result } = renderHook(() => useLocalStorage('bool-key', true))
      expect(result.current[0]).toBe(false)
    })

    it('toggles boolean value', () => {
      const { result } = renderHook(() => useLocalStorage('bool-key', false))
      act(() => { result.current[1](prev => !prev) })
      expect(result.current[0]).toBe(true)
    })
  })

  describe('null / undefined edge cases', () => {
    it('handles null stored value by returning defaultValue', () => {
      localStorage.removeItem('null-key')
      const { result } = renderHook(() => useLocalStorage('null-key', 'default'))
      expect(result.current[0]).toBe('default')
    })

    it('can store null as a value', () => {
      const { result } = renderHook(() => useLocalStorage<string | null>('null-val-key', null))
      expect(result.current[0]).toBeNull()
      act(() => { result.current[1]('set') })
      expect(result.current[0]).toBe('set')
    })
  })
})
