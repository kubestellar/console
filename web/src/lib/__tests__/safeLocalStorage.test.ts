/**
 * Unit tests for src/lib/safeLocalStorage.ts
 *
 * Covers all five exported helpers:
 *   safeGet, safeSet, safeRemove, safeGetJSON, safeSetJSON
 *
 * The test setup (src/test/setup.ts) installs an in-memory localStorage mock
 * that normally behaves like the real API. To exercise error paths we
 * temporarily replace the global with a throwing stub, then restore it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  safeGet,
  safeSet,
  safeRemove,
  safeGetJSON,
  safeSetJSON,
} from '../safeLocalStorage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace window.localStorage with a stub whose methods all throw. */
function makeBrokenStorage(): Storage {
  return {
    getItem: vi.fn(() => { throw new DOMException('SecurityError') }),
    setItem: vi.fn(() => { throw new DOMException('QuotaExceededError') }),
    removeItem: vi.fn(() => { throw new DOMException('SecurityError') }),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: 0,
  } as unknown as Storage
}

/** Patch localStorage methods with the provided stub for the duration of `fn`. */
function withStorage(stub: Storage, fn: () => void) {
  const originalGetItem = window.localStorage.getItem
  const originalSetItem = window.localStorage.setItem
  const originalRemoveItem = window.localStorage.removeItem

  window.localStorage.getItem = stub.getItem.bind(stub)
  window.localStorage.setItem = stub.setItem.bind(stub)
  window.localStorage.removeItem = stub.removeItem.bind(stub)

  try {
    fn()
  } finally {
    window.localStorage.getItem = originalGetItem
    window.localStorage.setItem = originalSetItem
    window.localStorage.removeItem = originalRemoveItem
  }
}

// ---------------------------------------------------------------------------
// safeGet
// ---------------------------------------------------------------------------

describe('safeGet', () => {
  beforeEach(() => localStorage.clear())

  it('returns the stored string value', () => {
    localStorage.setItem('key1', 'hello')
    expect(safeGet('key1')).toBe('hello')
  })

  it('returns null when the key does not exist', () => {
    expect(safeGet('nonexistent')).toBeNull()
  })

  it('returns null when localStorage throws (e.g. private mode)', () => {
    withStorage(makeBrokenStorage(), () => {
      expect(safeGet('any-key')).toBeNull()
    })
  })

  it('distinguishes between two different keys', () => {
    localStorage.setItem('a', 'alpha')
    localStorage.setItem('b', 'beta')
    expect(safeGet('a')).toBe('alpha')
    expect(safeGet('b')).toBe('beta')
  })

  it('returns an empty string stored as a value', () => {
    localStorage.setItem('empty', '')
    expect(safeGet('empty')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// safeSet
// ---------------------------------------------------------------------------

describe('safeSet', () => {
  beforeEach(() => localStorage.clear())

  it('stores a string value', () => {
    safeSet('myKey', 'myValue')
    expect(localStorage.getItem('myKey')).toBe('myValue')
  })

  it('overwrites an existing value', () => {
    localStorage.setItem('myKey', 'old')
    safeSet('myKey', 'new')
    expect(localStorage.getItem('myKey')).toBe('new')
  })

  it('does not throw when localStorage throws (quota exceeded / private mode)', () => {
    withStorage(makeBrokenStorage(), () => {
      expect(() => safeSet('key', 'value')).not.toThrow()
    })
  })

  it('stores an empty string', () => {
    safeSet('blank', '')
    expect(localStorage.getItem('blank')).toBe('')
  })

  it('stores a stringified JSON value', () => {
    const json = JSON.stringify({ count: 42 })
    safeSet('json-key', json)
    expect(localStorage.getItem('json-key')).toBe(json)
  })
})

// ---------------------------------------------------------------------------
// safeRemove
// ---------------------------------------------------------------------------

describe('safeRemove', () => {
  beforeEach(() => localStorage.clear())

  it('removes an existing key', () => {
    localStorage.setItem('toDelete', 'bye')
    safeRemove('toDelete')
    expect(localStorage.getItem('toDelete')).toBeNull()
  })

  it('does not throw when removing a key that does not exist', () => {
    expect(() => safeRemove('ghost')).not.toThrow()
  })

  it('does not throw when localStorage throws', () => {
    withStorage(makeBrokenStorage(), () => {
      expect(() => safeRemove('key')).not.toThrow()
    })
  })

  it('only removes the targeted key, not others', () => {
    localStorage.setItem('keep', 'me')
    localStorage.setItem('remove', 'me-too')
    safeRemove('remove')
    expect(localStorage.getItem('keep')).toBe('me')
    expect(localStorage.getItem('remove')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// safeGetJSON
// ---------------------------------------------------------------------------

describe('safeGetJSON', () => {
  beforeEach(() => localStorage.clear())

  it('parses and returns a stored object', () => {
    localStorage.setItem('obj', JSON.stringify({ x: 1, y: 'hello' }))
    expect(safeGetJSON('obj', null)).toEqual({ x: 1, y: 'hello' })
  })

  it('parses and returns a stored array', () => {
    localStorage.setItem('arr', JSON.stringify([1, 2, 3]))
    expect(safeGetJSON('arr', [])).toEqual([1, 2, 3])
  })

  it('parses and returns a stored number', () => {
    localStorage.setItem('num', '42')
    expect(safeGetJSON('num', 0)).toBe(42)
  })

  it('parses and returns a stored boolean', () => {
    localStorage.setItem('flag', 'true')
    expect(safeGetJSON('flag', false)).toBe(true)
  })

  it('returns the fallback when the key does not exist', () => {
    expect(safeGetJSON('missing', 'default')).toBe('default')
  })

  it('returns the fallback on invalid JSON', () => {
    localStorage.setItem('bad-json', '{{not valid}}')
    expect(safeGetJSON('bad-json', 'fallback')).toBe('fallback')
  })

  it('returns the fallback when localStorage throws', () => {
    withStorage(makeBrokenStorage(), () => {
      expect(safeGetJSON('any', 'fb')).toBe('fb')
    })
  })

  it('returns a null fallback when key is missing and fallback is null', () => {
    expect(safeGetJSON<null>('nope', null)).toBeNull()
  })

  it('returns an array fallback when key is missing', () => {
    expect(safeGetJSON('nope', [] as string[])).toEqual([])
  })

  it('returns the parsed null value instead of the fallback when stored value is the string "null"', () => {
    // JSON.parse('null') returns null — the user's fallback object should be returned
    // only when the raw value is absent (null from getItem), NOT when stored as 'null'.
    // 'null' parses to null successfully, so null is returned, not the fallback.
    localStorage.setItem('null-val', 'null')
    expect(safeGetJSON('null-val', { default: true })).toBeNull()
  })

  it('handles a stored empty object', () => {
    localStorage.setItem('empty-obj', '{}')
    expect(safeGetJSON('empty-obj', null)).toEqual({})
  })

  it('handles a stored empty array', () => {
    localStorage.setItem('empty-arr', '[]')
    expect(safeGetJSON('empty-arr', null)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// safeSetJSON
// ---------------------------------------------------------------------------

describe('safeSetJSON', () => {
  beforeEach(() => localStorage.clear())

  it('serializes and stores a plain object', () => {
    safeSetJSON('settings', { theme: 'dark', lang: 'en' })
    const raw = localStorage.getItem('settings')!
    expect(JSON.parse(raw)).toEqual({ theme: 'dark', lang: 'en' })
  })

  it('serializes and stores an array', () => {
    safeSetJSON('list', ['a', 'b', 'c'])
    expect(JSON.parse(localStorage.getItem('list')!)).toEqual(['a', 'b', 'c'])
  })

  it('serializes and stores a number', () => {
    safeSetJSON('count', 99)
    expect(JSON.parse(localStorage.getItem('count')!)).toBe(99)
  })

  it('serializes and stores null', () => {
    safeSetJSON('nullish', null)
    expect(localStorage.getItem('nullish')).toBe('null')
  })

  it('serializes and stores a boolean false', () => {
    safeSetJSON('disabled', false)
    expect(JSON.parse(localStorage.getItem('disabled')!)).toBe(false)
  })

  it('does not throw when localStorage.setItem throws (quota exceeded)', () => {
    withStorage(makeBrokenStorage(), () => {
      expect(() => safeSetJSON('key', { data: 'value' })).not.toThrow()
    })
  })

  it('does not throw on circular reference (JSON.stringify throws)', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    expect(() => safeSetJSON('circular', circular)).not.toThrow()
    // Nothing should be stored since stringify failed
    expect(localStorage.getItem('circular')).toBeNull()
  })

  it('overwrites an existing value', () => {
    safeSetJSON('over', { v: 1 })
    safeSetJSON('over', { v: 2 })
    expect(JSON.parse(localStorage.getItem('over')!)).toEqual({ v: 2 })
  })

  it('stores a nested object', () => {
    const nested = { a: { b: { c: 42 } } }
    safeSetJSON('nested', nested)
    expect(JSON.parse(localStorage.getItem('nested')!)).toEqual(nested)
  })

  it('round-trips correctly through safeGetJSON', () => {
    const original = { clusters: ['us-east', 'eu-west'], count: 2, active: true }
    safeSetJSON('round-trip', original)
    expect(safeGetJSON('round-trip', null)).toEqual(original)
  })
})
