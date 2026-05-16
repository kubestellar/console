import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

async function loadCache() {
  return import('../cache')
}

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cache helpers', () => {
  it('keeps pending writes readable until debounce flush', async () => {
    vi.useFakeTimers()
    const { __testables } = await loadCache()

    __testables.ssWrite('pods', { items: [1] }, 123)

    expect(__testables.ssRead('pods')).toEqual({ data: { items: [1] }, timestamp: 123 })
    expect(sessionStorage.getItem(`${__testables.SS_PREFIX}pods`)).toBeNull()

    vi.advanceTimersByTime(500)

    const stored = sessionStorage.getItem(`${__testables.SS_PREFIX}pods`)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored as string)).toEqual({
      d: { items: [1] },
      t: 123,
      v: __testables.CACHE_VERSION,
    })
  })

  it('drops stale snapshots with mismatched version', async () => {
    const { __testables } = await loadCache()
    const key = `${__testables.SS_PREFIX}stale`
    sessionStorage.setItem(key, JSON.stringify({ d: { ok: true }, t: 1, v: __testables.CACHE_VERSION - 1 }))

    expect(__testables.ssRead('stale')).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('removes only session snapshot keys', async () => {
    const { __testables } = await loadCache()
    sessionStorage.setItem(`${__testables.SS_PREFIX}one`, 'x')
    sessionStorage.setItem('plain', 'y')

    __testables.clearSessionSnapshots()

    expect(sessionStorage.getItem(`${__testables.SS_PREFIX}one`)).toBeNull()
    expect(sessionStorage.getItem('plain')).toBe('y')
  })

  it('compares initial values by shape, not reference', async () => {
    const { __testables } = await loadCache()

    expect(__testables.isEquivalentToInitial(null, undefined)).toBe(true)
    expect(__testables.isEquivalentToInitial([], [])).toBe(true)
    expect(__testables.isEquivalentToInitial({ a: 1 }, { a: 1 })).toBe(true)
    expect(__testables.isEquivalentToInitial({ a: 1 }, { a: 2 })).toBe(false)
    expect(__testables.isEquivalentToInitial('x', 'x')).toBe(false)
  })

  it('applies failure backoff with cap', async () => {
    const { __testables } = await loadCache()

    expect(__testables.getEffectiveInterval(60_000, 0)).toBe(60_000)
    expect(__testables.getEffectiveInterval(60_000, 1)).toBe(120_000)
    expect(__testables.getEffectiveInterval(60_000, 5)).toBeLessThanOrEqual(__testables.MAX_BACKOFF_INTERVAL)
    expect(__testables.getEffectiveInterval(60_000, 10)).toBe(__testables.MAX_BACKOFF_INTERVAL)
  })
})

describe('auto-refresh pause state', () => {
  it('notifies subscribers and supports unsubscribe', async () => {
    const { isAutoRefreshPaused, setAutoRefreshPaused, subscribeAutoRefreshPaused } = await loadCache()
    const onChange = vi.fn()

    expect(isAutoRefreshPaused()).toBe(false)
    const unsubscribe = subscribeAutoRefreshPaused(onChange)

    setAutoRefreshPaused(true)
    expect(isAutoRefreshPaused()).toBe(true)
    expect(onChange).toHaveBeenCalledWith(true)

    unsubscribe()
    setAutoRefreshPaused(false)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(isAutoRefreshPaused()).toBe(false)
  })
})
