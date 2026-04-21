import { describe, it, expect, beforeEach } from 'vitest'
import { setClientCtx, getClientCtx, clearClientCtx, captureClientCtxFromFragment } from '../clientCtx'

describe('clientCtx', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  describe('setClientCtx / getClientCtx round-trip', () => {
    it('stores and retrieves a value', () => {
      setClientCtx('my-token')
      expect(getClientCtx()).toBe('my-token')
    })

    it('stores value in obfuscated form (not plaintext in sessionStorage)', () => {
      setClientCtx('my-token')
      const raw = sessionStorage.getItem('kc_ux_ctx')
      expect(raw).not.toBeNull()
      expect(raw).not.toBe('my-token')
    })

    it('round-trips empty-ish values correctly — empty string skipped', () => {
      setClientCtx('')
      // Empty string is a no-op: getClientCtx returns ''
      expect(getClientCtx()).toBe('')
    })

    it('overwrites a previously stored value', () => {
      setClientCtx('first')
      setClientCtx('second')
      expect(getClientCtx()).toBe('second')
    })

    it('returns empty string when nothing stored', () => {
      expect(getClientCtx()).toBe('')
    })
  })

  describe('clearClientCtx', () => {
    it('removes the stored value', () => {
      setClientCtx('my-token')
      clearClientCtx()
      expect(getClientCtx()).toBe('')
    })

    it('does not throw when nothing stored', () => {
      expect(() => clearClientCtx()).not.toThrow()
    })
  })

  describe('captureClientCtxFromFragment', () => {
    it('returns false and stores nothing when hash is absent', () => {
      Object.defineProperty(window, 'location', {
        value: { hash: '', pathname: '/app', search: '' },
        writable: true,
        configurable: true,
      })
      expect(captureClientCtxFromFragment()).toBe(false)
      expect(getClientCtx()).toBe('')
    })

    it('returns false when hash has no kc_x param', () => {
      Object.defineProperty(window, 'location', {
        value: { hash: '#other=foo', pathname: '/app', search: '' },
        writable: true,
        configurable: true,
      })
      expect(captureClientCtxFromFragment()).toBe(false)
    })

    it('captures kc_x from fragment and returns true', () => {
      Object.defineProperty(window, 'location', {
        value: {
          hash: '#kc_x=captured-token',
          pathname: '/app',
          search: '',
        },
        writable: true,
        configurable: true,
      })
      const captured = captureClientCtxFromFragment()
      expect(captured).toBe(true)
      expect(getClientCtx()).toBe('captured-token')
    })
  })
})
