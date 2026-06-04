import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from '../authToken'
import { STORAGE_KEY_TOKEN } from '../constants/storage'
import { getToken } from '../cache/fetcherUtils'

describe('authToken', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearStoredAuthToken()
  })

  it('reads legacy raw session tokens in test environments', () => {
    sessionStorage.setItem(STORAGE_KEY_TOKEN, 'legacy-session-token')

    expect(getStoredAuthToken()).toBe('legacy-session-token')
  })

  it('reads legacy raw kc_token values in test environments', () => {
    localStorage.setItem('kc_token', 'legacy-kc-token')

    expect(getStoredAuthToken()).toBe('legacy-kc-token')
  })

  it('still prefers secure token storage writes', () => {
    setStoredAuthToken('secure-token')

    expect(getStoredAuthToken()).toBe('secure-token')
  })
})

describe('token retrieval fallback behavior', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearStoredAuthToken()
  })

  describe('getStoredAuthToken()', () => {
    it('returns token when secure store contains a valid token', () => {
      setStoredAuthToken('secure-stored-token')

      const token = getStoredAuthToken()
      expect(token).toBe('secure-stored-token')
    })

    it('returns null when no token is stored anywhere', () => {
      const token = getStoredAuthToken()
      expect(token).toBeNull()
    })

    it('falls back to legacy localStorage token when secure store is empty', () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'legacy-token')

      const token = getStoredAuthToken()
      expect(token).toBe('legacy-token')
    })
  })

  describe('getToken() from fetcherUtils', () => {
    it('returns secure token when getStoredAuthToken() has a value', () => {
      setStoredAuthToken('secure-token-from-store')

      const token = getToken()
      expect(token).toBe('secure-token-from-store')
    })

    it('falls back to localStorage when getStoredAuthToken() returns empty', () => {
      // Set only the raw localStorage token, not the secure store
      localStorage.setItem(STORAGE_KEY_TOKEN, 'fallback-token-from-storage')

      const token = getToken()
      expect(token).toBe('fallback-token-from-storage')
    })

    it('prioritizes secure store over localStorage fallback', () => {
      // Set both a secure token and a localStorage token
      setStoredAuthToken('secure-token')
      localStorage.setItem(STORAGE_KEY_TOKEN, 'fallback-token')

      const token = getToken()
      // Should return the secure token, not the fallback
      expect(token).toBe('secure-token')
    })

    it('returns null when neither secure store nor localStorage has a token', () => {
      const token = getToken()
      expect(token).toBeNull()
    })

    it('handles localStorage access errors gracefully', () => {
      // Mock localStorage.getItem to throw an error
      const originalGetItem = localStorage.getItem
      localStorage.getItem = vi.fn(() => {
        throw new Error('Storage access denied')
      })

      try {
        const token = getToken()
        // Should return null gracefully when localStorage throws
        expect(token).toBeNull()
      } finally {
        localStorage.getItem = originalGetItem
      }
    })
  })
})
