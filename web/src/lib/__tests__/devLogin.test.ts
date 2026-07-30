/**
 * devLogin — coverage for the passwordless dev-login helpers introduced in
 * #20823. The module is small but was previously untested; regressions here
 * would silently break the "no OAuth app configured" login path used by
 * in-cluster installs and the Continue-in-Demo-Mode fallback.
 *
 * Run:  npx vitest run src/lib/__tests__/devLogin.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { DEV_LOGIN_PATH, redirectToDevLogin } from '../devLogin'

describe('devLogin', () => {
  describe('DEV_LOGIN_PATH', () => {
    it('points at the backend GitHub auth entry point', () => {
      // Contract: backend expects '/auth/github' for the passwordless dev-login
      // fall-through when no GitHub OAuth app is configured (#20823). Changing
      // this string requires a coordinated backend change.
      expect(DEV_LOGIN_PATH).toBe('/auth/github')
    })

    it('is a non-empty string', () => {
      expect(typeof DEV_LOGIN_PATH).toBe('string')
      expect(DEV_LOGIN_PATH.length).toBeGreaterThan(0)
    })
  })

  describe('redirectToDevLogin', () => {
    let originalLocation: Location
    let assignMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      originalLocation = window.location
      assignMock = vi.fn()
      // jsdom's window.location is read-only in newer versions; redefine it
      // so we can spy on assign() without triggering a real navigation.
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: {
          ...originalLocation,
          assign: assignMock,
        } as unknown as Location,
      })
    })

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      })
      vi.restoreAllMocks()
    })

    it('navigates to DEV_LOGIN_PATH via window.location.assign', () => {
      redirectToDevLogin()

      expect(assignMock).toHaveBeenCalledTimes(1)
      expect(assignMock).toHaveBeenCalledWith(DEV_LOGIN_PATH)
    })

    it('uses assign (not replace or href) so history is preserved', () => {
      // Using assign() rather than href= keeps the pre-login page in browser
      // history, which the auth callback relies on for the post-login bounce.
      redirectToDevLogin()

      expect(assignMock).toHaveBeenCalled()
      expect(assignMock.mock.calls[0][0]).toBe('/auth/github')
    })

    it('is a synchronous, void-returning function', () => {
      const result = redirectToDevLogin()
      expect(result).toBeUndefined()
    })
  })
})
