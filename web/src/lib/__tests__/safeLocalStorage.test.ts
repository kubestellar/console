import { describe, it, expect, beforeEach, vi } from 'vitest'
import { safeGet, safeSet, safeRemove, safeGetJSON, safeSetJSON } from '../safeLocalStorage'

beforeEach(() => {
  localStorage.clear()
})

describe('safeGet', () => {
  it('returns null when key does not exist', () => {
    expect(safeGet('missing-key')).toBeNull()
  })

  it('returns stored string value', () => {
    localStorage.setItem('test-key', 'hello')
    expect(safeGet('test-key')).toBe('hello')
  })

  it('returns null on localStorage error', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementationOnce(() => {
      throw new Error('storage unavailable')
    })
    expect(safeGet('any-key')).toBeNull()
  })
})

describe('safeSet', () => {
  it('stores a string value', () => {
    safeSet('my-key', 'my-value')
    expect(localStorage.getItem('my-key')).toBe('my-value')
  })

  it('overwrites existing value', () => {
    safeSet('k', 'v1')
    safeSet('k', 'v2')
    expect(localStorage.getItem('k')).toBe('v2')
  })

  it('does not throw on localStorage error', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => safeSet('k', 'v')).not.toThrow()
  })
})

describe('safeRemove', () => {
  it('removes an existing key', () => {
    localStorage.setItem('to-remove', 'value')
    safeRemove('to-remove')
    expect(localStorage.getItem('to-remove')).toBeNull()
  })

  it('does not throw when key does not exist', () => {
    expect(() => safeRemove('nonexistent')).not.toThrow()
  })

  it('does not throw on localStorage error', () => {
    vi.spyOn(window.localStorage, 'removeItem').mockImplementationOnce(() => {
      throw new Error('storage unavailable')
    })
    expect(() => safeRemove('k')).not.toThrow()
  })
})

describe('safeGetJSON', () => {
  it('returns fallback when key does not exist', () => {
    expect(safeGetJSON('missing', { default: true })).toEqual({ default: true })
  })

  it('returns parsed object', () => {
    localStorage.setItem('obj-key', JSON.stringify({ count: 42 }))
    expect(safeGetJSON('obj-key', {})).toEqual({ count: 42 })
  })

  it('returns fallback for malformed JSON', () => {
    localStorage.setItem('bad-json', 'not-valid{{{')
    expect(safeGetJSON('bad-json', 'fallback')).toBe('fallback')
  })

  it('returns fallback array when key missing', () => {
    expect(safeGetJSON<string[]>('arr', [])).toEqual([])
  })

  it('returns fallback number when key missing', () => {
    expect(safeGetJSON('num', 0)).toBe(0)
  })
})

describe('safeSetJSON', () => {
  it('stores serialized object', () => {
    safeSetJSON('json-key', { value: 1 })
    expect(JSON.parse(localStorage.getItem('json-key')!)).toEqual({ value: 1 })
  })

  it('stores arrays', () => {
    safeSetJSON('arr-key', [1, 2, 3])
    expect(JSON.parse(localStorage.getItem('arr-key')!)).toEqual([1, 2, 3])
  })

  it('does not throw for non-serializable values', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => safeSetJSON('circ', circular)).not.toThrow()
  })
})
