/**
 * Tests for cardFilters.ts — covers the two pure localStorage helpers:
 * readPersistedItemsPerPage and writePersistedItemsPerPage.
 * Both are independently testable without React (they only use localStorage).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  readPersistedItemsPerPage,
  writePersistedItemsPerPage,
  LOCAL_LIMIT_STORAGE_PREFIX,
} from '../cardFilters'

describe('readPersistedItemsPerPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when storageKey is undefined', () => {
    expect(readPersistedItemsPerPage(undefined)).toBeNull()
  })

  it('returns null when the key is not in localStorage', () => {
    expect(readPersistedItemsPerPage('non-existent-card')).toBeNull()
  })

  it('returns the stored positive integer', () => {
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}my-card`, '10')
    expect(readPersistedItemsPerPage('my-card')).toBe(10)
  })

  it('returns 1 as a valid minimum positive integer', () => {
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}my-card`, '1')
    expect(readPersistedItemsPerPage('my-card')).toBe(1)
  })

  it('returns "unlimited" when stored value is "unlimited"', () => {
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}my-card`, 'unlimited')
    expect(readPersistedItemsPerPage('my-card')).toBe('unlimited')
  })

  it('returns null for non-numeric stored value', () => {
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}my-card`, 'banana')
    expect(readPersistedItemsPerPage('my-card')).toBeNull()
  })

  it('returns null for "0" (zero is not a valid items-per-page)', () => {
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}my-card`, '0')
    expect(readPersistedItemsPerPage('my-card')).toBeNull()
  })

  it('returns null for negative numbers', () => {
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}my-card`, '-5')
    expect(readPersistedItemsPerPage('my-card')).toBeNull()
  })

  it('returns null for "NaN"', () => {
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}my-card`, 'NaN')
    expect(readPersistedItemsPerPage('my-card')).toBeNull()
  })

  it('returns null for "Infinity"', () => {
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}my-card`, 'Infinity')
    expect(readPersistedItemsPerPage('my-card')).toBeNull()
  })

  it('uses the correct storage key prefix', () => {
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}card-x`, '25')
    // Key without prefix → null
    expect(readPersistedItemsPerPage('not-card-x')).toBeNull()
    // Correct key → value
    expect(readPersistedItemsPerPage('card-x')).toBe(25)
  })

  it('isolates different card keys', () => {
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}card-a`, '5')
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}card-b`, '20')
    expect(readPersistedItemsPerPage('card-a')).toBe(5)
    expect(readPersistedItemsPerPage('card-b')).toBe(20)
  })
})

describe('writePersistedItemsPerPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('is a no-op when storageKey is undefined', () => {
    writePersistedItemsPerPage(undefined, 10)
    expect(localStorage.length).toBe(0)
  })

  it('writes a numeric value as its string representation', () => {
    writePersistedItemsPerPage('my-card', 10)
    expect(localStorage.getItem(`${LOCAL_LIMIT_STORAGE_PREFIX}my-card`)).toBe('10')
  })

  it('writes "unlimited" as-is', () => {
    writePersistedItemsPerPage('my-card', 'unlimited')
    expect(localStorage.getItem(`${LOCAL_LIMIT_STORAGE_PREFIX}my-card`)).toBe('unlimited')
  })

  it('overwrites a previously stored value', () => {
    writePersistedItemsPerPage('my-card', 5)
    writePersistedItemsPerPage('my-card', 20)
    expect(localStorage.getItem(`${LOCAL_LIMIT_STORAGE_PREFIX}my-card`)).toBe('20')
  })

  it('uses the correct storage key prefix when writing', () => {
    writePersistedItemsPerPage('test', 7)
    expect(localStorage.getItem(`${LOCAL_LIMIT_STORAGE_PREFIX}test`)).toBe('7')
    // Raw key without prefix should be absent
    expect(localStorage.getItem('test')).toBeNull()
  })

  it('round-trips a number: write then read returns same value', () => {
    writePersistedItemsPerPage('rt-card', 15)
    expect(readPersistedItemsPerPage('rt-card')).toBe(15)
  })

  it('round-trips "unlimited": write then read returns "unlimited"', () => {
    writePersistedItemsPerPage('rt-card', 'unlimited')
    expect(readPersistedItemsPerPage('rt-card')).toBe('unlimited')
  })

  it('isolates writes to separate card keys', () => {
    writePersistedItemsPerPage('card-1', 5)
    writePersistedItemsPerPage('card-2', 25)
    expect(readPersistedItemsPerPage('card-1')).toBe(5)
    expect(readPersistedItemsPerPage('card-2')).toBe(25)
  })
})
