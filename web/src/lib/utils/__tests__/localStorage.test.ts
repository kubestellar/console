import { describe, it, expect, beforeEach } from 'vitest'
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

  it('stores a value and returns true', () => {
    expect(safeSetItem('key', 'val')).toBe(true)
    expect(localStorage.getItem('key')).toBe('val')
  })
})

describe('safeRemoveItem', () => {
  beforeEach(() => { localStorage.clear() })

  it('removes a key and returns true', () => {
    localStorage.setItem('key', 'val')
    expect(safeRemoveItem('key')).toBe(true)
    expect(localStorage.getItem('key')).toBeNull()
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

  it('stores JSON and returns true', () => {
    expect(safeSetJSON('key', { x: 1 })).toBe(true)
    expect(JSON.parse(localStorage.getItem('key')!)).toEqual({ x: 1 })
  })

  it('handles arrays', () => {
    expect(safeSetJSON('arr', [1, 2, 3])).toBe(true)
    expect(JSON.parse(localStorage.getItem('arr')!)).toEqual([1, 2, 3])
  })
})
