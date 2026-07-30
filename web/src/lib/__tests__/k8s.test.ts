import { describe, it, expect } from 'vitest'
import { parseReadyCount, isPodHealthy } from '../../lib/k8s'

describe('parseReadyCount', () => {
  it('parses valid "ready/total" string', () => {
    expect(parseReadyCount('2/3')).toEqual({ ready: 2, total: 3 })
  })

  it('parses "0/0" string', () => {
    expect(parseReadyCount('0/0')).toEqual({ ready: 0, total: 0 })
  })

  it('parses fully ready pod', () => {
    expect(parseReadyCount('3/3')).toEqual({ ready: 3, total: 3 })
  })

  it('returns zeros for undefined input', () => {
    expect(parseReadyCount(undefined)).toEqual({ ready: 0, total: 0 })
  })

  it('returns zeros for empty string', () => {
    expect(parseReadyCount('')).toEqual({ ready: 0, total: 0 })
  })

  it('returns zeros for malformed string without slash', () => {
    expect(parseReadyCount('invalid')).toEqual({ ready: 0, total: 0 })
  })

  it('returns zeros for non-numeric parts', () => {
    expect(parseReadyCount('abc/def')).toEqual({ ready: 0, total: 0 })
  })
})

describe('isPodHealthy', () => {
  it('returns true for running pod with all containers ready', () => {
    expect(isPodHealthy({ status: 'Running', ready: '3/3' })).toBe(true)
  })

  it('returns false for running pod with not all containers ready', () => {
    expect(isPodHealthy({ status: 'Running', ready: '1/3' })).toBe(false)
  })

  it('returns false for non-running pod', () => {
    expect(isPodHealthy({ status: 'Pending', ready: '0/1' })).toBe(false)
  })

  it('returns false for CrashLoopBackOff', () => {
    expect(isPodHealthy({ status: 'CrashLoopBackOff', ready: '0/1' })).toBe(false)
  })

  it('returns false when status is undefined', () => {
    expect(isPodHealthy({ ready: '1/1' })).toBe(false)
  })

  it('returns false when ready is undefined', () => {
    expect(isPodHealthy({ status: 'Running' })).toBe(false)
  })

  it('returns false for empty pod object', () => {
    expect(isPodHealthy({})).toBe(false)
  })

  it('handles case-insensitive status check', () => {
    expect(isPodHealthy({ status: 'RUNNING', ready: '2/2' })).toBe(true)
    expect(isPodHealthy({ status: 'running', ready: '1/1' })).toBe(true)
  })

  it('returns false when total is zero even if running', () => {
    expect(isPodHealthy({ status: 'Running', ready: '0/0' })).toBe(false)
  })
})
