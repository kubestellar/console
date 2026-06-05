import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { safeGetItem, safeSetItem, safeRemoveItem, safeGetJSON, safeSetJSON } from '../localStorage'

describe('dispatchStorageError (via public API)', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('dispatches storage-error CustomEvent when setItem fails', () => {
    const handler = vi.fn()
    window.addEventListener('storage-error', handler)

    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    safeSetItem('my-key', 'value')

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0][0] as CustomEvent
    expect(event.detail).toMatchObject({
      operation: 'setItem',
      key: 'my-key',
      error: 'QuotaExceededError',
    })
    expect(event.detail.timestamp).toBeTypeOf('number')

    window.removeEventListener('storage-error', handler)
  })

  it('dispatches storage-error CustomEvent when getItem fails', () => {
    const handler = vi.fn()
    window.addEventListener('storage-error', handler)

    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    safeGetItem('test-key')

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0][0] as CustomEvent
    expect(event.detail.operation).toBe('getItem')
    expect(event.detail.key).toBe('test-key')

    window.removeEventListener('storage-error', handler)
  })

  it('sanitizes key in dispatched event detail', () => {
    const handler = vi.fn()
    window.addEventListener('storage-error', handler)

    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('fail')
    })

    safeSetItem('key with spaces & <special>', 'val')

    const event = handler.mock.calls[0][0] as CustomEvent
    expect(event.detail.key).toBe('key%20with%20spaces%20%26%20%3Cspecial%3E')

    window.removeEventListener('storage-error', handler)
  })
})

describe('safeGetItem', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns null for missing key', () => {
    expect(safeGetItem('missing')).toBeNull()
  })

  it('returns stored value', () => {
    localStorage.setItem('test', 'value')
    expect(safeGetItem('test')).toBe('value')
  })
})

describe('safeSetItem', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('stores a value and returns true', () => {
    expect(safeSetItem('key', 'val')).toBe(true)
    expect(localStorage.getItem('key')).toBe('val')
  })

  it('returns false when setItem throws (quota exceeded)', () => {
    // Issue 9372: the test setup (src/test/setup.ts) replaces window.localStorage
    // with a plain object literal, so it does NOT inherit from Storage.prototype.
    // Spying on Storage.prototype.setItem therefore never intercepts the mocked
    // instance's method — we must spy directly on the localStorage instance.
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new DOMException('QuotaExceededError') })
    expect(safeSetItem('key', 'val')).toBe(false)
  })
})

describe('safeRemoveItem', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('removes a key and returns true', () => {
    localStorage.setItem('key', 'val')
    expect(safeRemoveItem('key')).toBe(true)
    expect(localStorage.getItem('key')).toBeNull()
  })

  it('returns false when removeItem throws', () => {
    // Issue 9372: spy directly on the localStorage instance — see note above.
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => { throw new Error('storage error') })
    expect(safeRemoveItem('key')).toBe(false)
  })
})

describe('safeGetJSON', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns null for missing key', () => {
    expect(safeGetJSON('missing')).toBeNull()
  })

  it('parses stored JSON', () => {
    localStorage.setItem('json', JSON.stringify({ a: 1 }))
    expect(safeGetJSON('json')).toEqual({ a: 1 })
  })

  it('returns null for invalid JSON', () => {
    localStorage.setItem('bad', 'not-json')
    expect(safeGetJSON('bad')).toBeNull()
  })

  it('returns null for empty string', () => {
    localStorage.setItem('empty', '')
    expect(safeGetJSON('empty')).toBeNull()
  })
})

describe('safeSetJSON', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('stores JSON and returns true', () => {
    expect(safeSetJSON('key', { x: 1 })).toBe(true)
    expect(JSON.parse(localStorage.getItem('key')!)).toEqual({ x: 1 })
  })

  it('handles arrays', () => {
    expect(safeSetJSON('arr', [1, 2, 3])).toBe(true)
    expect(JSON.parse(localStorage.getItem('arr')!)).toEqual([1, 2, 3])
  })

  it('returns false when setItem throws (quota exceeded)', () => {
    // Issue 9372: spy directly on the localStorage instance — see note in safeSetItem.
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new DOMException('QuotaExceededError') })
    expect(safeSetJSON('key', { x: 1 })).toBe(false)
  })
})
