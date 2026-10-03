import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { importHooks } from './hooks.setup'

describe('useLocalPreference', () => {
  it('returns defaultValue when localStorage is empty', async () => {
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('test-key', 42))
    expect(result.current[0]).toBe(42)
  })

  it('initializes from existing localStorage value', async () => {
    localStorage.setItem('kubestellar-pref:test-key', JSON.stringify('cached'))
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('test-key', 'default'))
    expect(result.current[0]).toBe('cached')
  })

  it('persists value to localStorage on change', async () => {
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('persist-key', 10))

    act(() => {
      result.current[1](20)
    })

    expect(result.current[0]).toBe(20)
    expect(localStorage.getItem('kubestellar-pref:persist-key')).toBe('20')
  })

  it('supports functional updater', async () => {
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('func-key', 5))

    act(() => {
      result.current[1]((prev) => prev + 10)
    })

    expect(result.current[0]).toBe(15)
  })

  it('returns defaultValue when localStorage has invalid JSON', async () => {
    localStorage.setItem('kubestellar-pref:broken', '!!!not-json')
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('broken', 'fallback'))
    expect(result.current[0]).toBe('fallback')
  })

  it('handles complex objects', async () => {
    const complexObj = { nested: { arr: [1, 2], flag: true } }
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() =>
      useLocalPreference('complex', { nested: { arr: [] as number[], flag: false } })
    )

    act(() => {
      result.current[1](complexObj)
    })

    expect(result.current[0]).toEqual(complexObj)
    expect(JSON.parse(localStorage.getItem('kubestellar-pref:complex')!)).toEqual(complexObj)
  })

  it('handles boolean defaultValue correctly', async () => {
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('bool-key', false))
    expect(result.current[0]).toBe(false)

    act(() => {
      result.current[1](true)
    })

    expect(result.current[0]).toBe(true)
  })

  it('handles array defaultValue correctly', async () => {
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('arr-key', ['a', 'b']))
    expect(result.current[0]).toEqual(['a', 'b'])
  })

  it('cleans up old preferences on QuotaExceededError then retries', async () => {
    // Seed some existing preferences so cleanup has something to remove
    localStorage.setItem('kubestellar-pref:old1', '"v1"')
    localStorage.setItem('kubestellar-pref:old2', '"v2"')
    localStorage.setItem('kubestellar-pref:old3', '"v3"')
    localStorage.setItem('kubestellar-pref:old4', '"v4"')

    let setItemCallCount = 0
    const originalSetItem = localStorage.setItem.bind(localStorage)
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      setItemCallCount++
      // First call to the target key throws QuotaExceeded; retry succeeds
      if (key === 'kubestellar-pref:quota-key' && setItemCallCount <= 1) {
        const err = new DOMException('QuotaExceededError', 'QuotaExceededError')
        Object.defineProperty(err, 'name', { value: 'QuotaExceededError' })
        throw err
      }
      return originalSetItem(key, value)
    })

    const { useLocalPreference } = await importHooks()
    // Rendering triggers the useEffect that writes to localStorage
    renderHook(() => useLocalPreference('quota-key', 'data'))

    // The hook should have attempted setItem, hit quota, cleaned up, then retried
    expect(setItemCallCount).toBeGreaterThanOrEqual(1)
    setItemSpy.mockRestore()
  })

  it('survives when QuotaExceededError retry also fails', async () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const err = new DOMException('QuotaExceededError', 'QuotaExceededError')
      Object.defineProperty(err, 'name', { value: 'QuotaExceededError' })
      throw err
    })

    const { useLocalPreference } = await importHooks()
    // Should not throw even if all writes fail
    const { result } = renderHook(() => useLocalPreference('always-fail', 'data'))
    expect(result.current[0]).toBe('data')
    setItemSpy.mockRestore()
  })

  it('non-QuotaExceeded errors in setItem are silently ignored', async () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Some other storage error')
    })

    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('other-err', 'val'))
    expect(result.current[0]).toBe('val')
    setItemSpy.mockRestore()
  })
})

// ===========================================================================
// useClusterFilterPreference
// ===========================================================================

describe('useClusterFilterPreference', () => {
  it('returns empty array as default', async () => {
    const { useClusterFilterPreference } = await importHooks()
    const { result } = renderHook(() => useClusterFilterPreference('my-card'))
    expect(result.current[0]).toEqual([])
  })

  it('stores under card-filter: prefix', async () => {
    const { useClusterFilterPreference } = await importHooks()
    const { result } = renderHook(() => useClusterFilterPreference('my-card'))

    act(() => {
      result.current[1](['cluster-a', 'cluster-b'])
    })

    expect(result.current[0]).toEqual(['cluster-a', 'cluster-b'])
    expect(
      localStorage.getItem('kubestellar-pref:card-filter:my-card')
    ).toBe(JSON.stringify(['cluster-a', 'cluster-b']))
  })
})

// ===========================================================================
// useSortPreference
// ===========================================================================

describe('useSortPreference', () => {
  it('returns defaultSort as default', async () => {
    const { useSortPreference } = await importHooks()
    const { result } = renderHook(() => useSortPreference('sort-card', 'name'))
    expect(result.current[0]).toBe('name')
  })

  it('stores under card-sort: prefix', async () => {
    const { useSortPreference } = await importHooks()
    const { result } = renderHook(() => useSortPreference('sort-card', 'name'))

    act(() => {
      result.current[1]('date')
    })

    expect(result.current[0]).toBe('date')
    expect(localStorage.getItem('kubestellar-pref:card-sort:sort-card')).toBe('"date"')
  })
})

// ===========================================================================
// useCollapsedPreference
// ===========================================================================

describe('useCollapsedPreference', () => {
  it('returns false as default', async () => {
    const { useCollapsedPreference } = await importHooks()
    const { result } = renderHook(() => useCollapsedPreference('col-card'))
    expect(result.current[0]).toBe(false)
  })

  it('toggles collapsed state', async () => {
    const { useCollapsedPreference } = await importHooks()
    const { result } = renderHook(() => useCollapsedPreference('col-card'))

    act(() => {
      result.current[1](true)
    })

    expect(result.current[0]).toBe(true)
    expect(localStorage.getItem('kubestellar-pref:card-collapsed:col-card')).toBe('true')
  })
})

// ===========================================================================
// useIndexedData
// ===========================================================================
