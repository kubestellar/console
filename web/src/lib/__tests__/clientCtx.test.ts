import { describe, it, expect, beforeEach } from 'vitest'
import { setClientCtx, getClientCtx, clearClientCtx, captureClientCtxFromFragment } from '../clientCtx'

describe('clientCtx', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  describe('setClientCtx / getClientCtx round-trip', () => {
    it('stores and retrieves a value', async () => {
      await setClientCtx('my-token')
      expect(await getClientCtx()).toBe('my-token')
    })

    it('stores value in encrypted form (not plaintext in sessionStorage)', async () => {
      await setClientCtx('my-token')
      const raw = sessionStorage.getItem('kc_ux_ctx')
      expect(raw).not.toBeNull()
      expect(raw).not.toBe('my-token')
    })

    it('round-trips empty-ish values correctly — empty string skipped', async () => {
      await setClientCtx('')
      // Empty string is a no-op: getClientCtx returns ''
      expect(await getClientCtx()).toBe('')
    })

    it('overwrites a previously stored value', async () => {
      await setClientCtx('first')
      await setClientCtx('second')
      expect(await getClientCtx()).toBe('second')
    })

    it('returns empty string when nothing stored', async () => {
      expect(await getClientCtx()).toBe('')
    })
  })

  describe('clearClientCtx', () => {
    it('removes the stored value', async () => {
      await setClientCtx('my-token')
      clearClientCtx()
      expect(await getClientCtx()).toBe('')
    })

    it('does not throw when nothing stored', () => {
      expect(() => clearClientCtx()).not.toThrow()
    })
  })

  describe('captureClientCtxFromFragment', () => {
    it('returns false and stores nothing when hash is absent', async () => {
      Object.defineProperty(window, 'location', {
        value: { hash: '', pathname: '/app', search: '' },
        writable: true,
        configurable: true,
      })
      expect(await captureClientCtxFromFragment()).toBe(false)
      expect(await getClientCtx()).toBe('')
    })

    it('returns false when hash has no kc_x param', async () => {
      Object.defineProperty(window, 'location', {
        value: { hash: '#other=foo', pathname: '/app', search: '' },
        writable: true,
        configurable: true,
      })
      expect(await captureClientCtxFromFragment()).toBe(false)
    })

    it('captures kc_x from fragment and returns true', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          hash: '#kc_x=captured-token',
          pathname: '/app',
          search: '',
        },
        writable: true,
        configurable: true,
      })
      const captured = await captureClientCtxFromFragment()
      expect(captured).toBe(true)
      expect(await getClientCtx()).toBe('captured-token')
    })
  })
})
