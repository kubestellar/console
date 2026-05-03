import { describe, it, expect, beforeEach } from 'vitest'
import { __testables } from '../useSelfUpgrade'

const {
  getToken,
  SELF_UPGRADE_TIMEOUT_MS,
  RESTART_POLL_INTERVAL_MS,
  RESTART_POLL_MAX_MS,
  RESTART_HEALTH_TIMEOUT_MS,
  RELOAD_DELAY_MS,
} = __testables

describe('useSelfUpgrade __testables', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getToken', () => {
    it('returns null when no token is stored', () => {
      expect(getToken()).toBeNull()
    })

    it('returns the stored token value', () => {
      localStorage.setItem('token', 'my-jwt-token-123')
      expect(getToken()).toBe('my-jwt-token-123')
    })

    it('returns updated value after token changes', () => {
      localStorage.setItem('token', 'first-token')
      expect(getToken()).toBe('first-token')

      localStorage.setItem('token', 'second-token')
      expect(getToken()).toBe('second-token')
    })

    it('returns null after token is removed', () => {
      localStorage.setItem('token', 'temp-token')
      expect(getToken()).toBe('temp-token')

      localStorage.removeItem('token')
      expect(getToken()).toBeNull()
    })

    it('returns empty string when token is set to empty', () => {
      localStorage.setItem('token', '')
      expect(getToken()).toBe('')
    })
  })

  describe('constants', () => {
    it('SELF_UPGRADE_TIMEOUT_MS is 15 seconds', () => {
      expect(SELF_UPGRADE_TIMEOUT_MS).toBe(15_000)
    })

    it('RESTART_POLL_INTERVAL_MS is 3 seconds', () => {
      expect(RESTART_POLL_INTERVAL_MS).toBe(3_000)
    })

    it('RESTART_POLL_MAX_MS is 120 seconds', () => {
      expect(RESTART_POLL_MAX_MS).toBe(120_000)
    })

    it('RESTART_HEALTH_TIMEOUT_MS is 3 seconds', () => {
      expect(RESTART_HEALTH_TIMEOUT_MS).toBe(3_000)
    })

    it('RELOAD_DELAY_MS is 1.5 seconds', () => {
      expect(RELOAD_DELAY_MS).toBe(1_500)
    })

    it('all constants are positive numbers', () => {
      const constants = [
        SELF_UPGRADE_TIMEOUT_MS,
        RESTART_POLL_INTERVAL_MS,
        RESTART_POLL_MAX_MS,
        RESTART_HEALTH_TIMEOUT_MS,
        RELOAD_DELAY_MS,
      ]
      for (const c of constants) {
        expect(typeof c).toBe('number')
        expect(c).toBeGreaterThan(0)
      }
    })

    it('poll interval is less than poll max', () => {
      expect(RESTART_POLL_INTERVAL_MS).toBeLessThan(RESTART_POLL_MAX_MS)
    })

    it('health timeout does not exceed poll interval', () => {
      expect(RESTART_HEALTH_TIMEOUT_MS).toBeLessThanOrEqual(RESTART_POLL_INTERVAL_MS)
    })

    it('reload delay is less than upgrade timeout', () => {
      expect(RELOAD_DELAY_MS).toBeLessThan(SELF_UPGRADE_TIMEOUT_MS)
    })
  })
})
