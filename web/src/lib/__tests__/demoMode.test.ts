import { describe, it, expect, beforeEach } from 'vitest'
import {
  isDemoMode,
  isDemoToken,
  hasRealToken,
  canToggleDemoMode,
} from '../demoMode'

describe('isDemoMode', () => {
  it('returns a boolean', () => {
    expect(typeof isDemoMode()).toBe('boolean')
  })
})

describe('isDemoToken', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns true when no token', () => {
    expect(isDemoToken()).toBe(true)
  })

  it('returns true for demo-token', () => {
    localStorage.setItem('token', 'demo-token')
    expect(isDemoToken()).toBe(true)
  })

  it('returns false for real token', () => {
    localStorage.setItem('token', 'real-jwt-token')
    expect(isDemoToken()).toBe(false)
  })
})

describe('hasRealToken', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns false when no token', () => {
    expect(hasRealToken()).toBe(false)
  })

  it('returns false for demo token', () => {
    localStorage.setItem('token', 'demo-token')
    expect(hasRealToken()).toBe(false)
  })

  it('returns true for real token', () => {
    localStorage.setItem('token', 'real-jwt-token')
    expect(hasRealToken()).toBe(true)
  })
})

describe('canToggleDemoMode', () => {
  it('returns a boolean', () => {
    expect(typeof canToggleDemoMode()).toBe('boolean')
  })
})
