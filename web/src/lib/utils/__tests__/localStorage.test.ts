import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { safeGetItem, safeSetItem, safeRemoveItem, safeGetJSON, safeSetJSON } from '../localStorage'

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
