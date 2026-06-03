import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setClientCtx, getClientCtx, clearClientCtx, captureClientCtxFromFragment } from '../clientCtx'

describe('clientCtx', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  describe('setClientCtx / getClientCtx compatibility behavior', () => {
    it('never stores the credential in sessionStorage', () => {
      setClientCtx('my-token')
      expect(getClientCtx()).toBe('')
      expect(sessionStorage.getItem('kc_ux_ctx')).toBeNull()
    })

    it('returns empty string when nothing is stored', () => {
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

    it('strips kc_x from the fragment without storing it', () => {
      const replaceState = vi.fn()
      Object.defineProperty(window, 'history', {
        value: { replaceState },
        writable: true,
        configurable: true,
      })
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
      expect(getClientCtx()).toBe('')
      expect(replaceState).toHaveBeenCalledWith(null, '', '/app')
    })
  })
})
