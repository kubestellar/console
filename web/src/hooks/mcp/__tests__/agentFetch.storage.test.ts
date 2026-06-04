import { describe, it, expect, beforeEach } from 'vitest'
import {
  getStoredAgentToken,
  setAgentToken,
  clearAgentToken,
  _resetAgentTokenState,
  AGENT_TOKEN_STORAGE_KEY,
} from '../agentFetch'

describe('agentFetch token storage — memory-only (CWE-922, #16903)', () => {
  beforeEach(() => {
    _resetAgentTokenState()
    sessionStorage.clear()
    localStorage.clear()
  })

  describe('setAgentToken', () => {
    it('stores token in memory only', () => {
      setAgentToken('test-token-abc123')

      expect(getStoredAgentToken()).toBe('test-token-abc123')
    })

    it('does NOT write to sessionStorage', () => {
      setAgentToken('test-token-abc123')

      expect(sessionStorage.getItem(AGENT_TOKEN_STORAGE_KEY)).toBeNull()
    })

    it('does NOT write to localStorage', () => {
      setAgentToken('test-token-abc123')

      expect(localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)).toBeNull()
    })

    it('overwrites previous in-memory token', () => {
      setAgentToken('first-token')
      expect(getStoredAgentToken()).toBe('first-token')

      setAgentToken('second-token')
      expect(getStoredAgentToken()).toBe('second-token')
    })
  })

  describe('clearAgentToken', () => {
    it('clears in-memory token', () => {
      setAgentToken('token-to-clear')
      expect(getStoredAgentToken()).toBe('token-to-clear')

      clearAgentToken()
      expect(getStoredAgentToken()).toBe('')
    })

    it('returns empty string after clear', () => {
      setAgentToken('ephemeral-token')
      clearAgentToken()

      expect(getStoredAgentToken()).toBe('')
    })
  })

  describe('_resetAgentTokenState (page reload simulation)', () => {
    it('does not persist token across page reloads', () => {
      setAgentToken('session-token')
      expect(getStoredAgentToken()).toBe('session-token')

      // Simulate page reload
      _resetAgentTokenState()

      expect(getStoredAgentToken()).toBe('')
    })

    it('resets token even if stored before reset', () => {
      setAgentToken('token-before-reload')
      _resetAgentTokenState()

      // After reset, token should be gone
      expect(getStoredAgentToken()).toBe('')

      // Verify sessionStorage also clean
      expect(sessionStorage.getItem(AGENT_TOKEN_STORAGE_KEY)).toBeNull()
    })
  })

  describe('legacy token cleanup', () => {
    it('clears legacy token from sessionStorage when getting token', () => {
      // Simulate a legacy token persisted in sessionStorage
      sessionStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'legacy-token')

      // getStoredAgentToken should clean it up
      const token = getStoredAgentToken()

      expect(token).toBe('')
      expect(sessionStorage.getItem(AGENT_TOKEN_STORAGE_KEY)).toBeNull()
    })

    it('clears legacy token from localStorage when getting token', () => {
      // Simulate a legacy token persisted in localStorage
      localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'legacy-token')

      // getStoredAgentToken should clean it up
      const token = getStoredAgentToken()

      expect(token).toBe('')
      expect(localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)).toBeNull()
    })

    it('clears legacy tokens when setting new token', () => {
      // Simulate legacy tokens in storage
      sessionStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'old-session-token')
      localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'old-local-token')

      setAgentToken('new-token')

      // New token should be in memory only
      expect(getStoredAgentToken()).toBe('new-token')

      // Legacy tokens should be cleared
      expect(sessionStorage.getItem(AGENT_TOKEN_STORAGE_KEY)).toBeNull()
      expect(localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)).toBeNull()
    })

    it('clears legacy tokens when clearing token', () => {
      // Simulate legacy tokens in storage
      sessionStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'old-session-token')
      localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'old-local-token')

      clearAgentToken()

      // All storage should be clean
      expect(getStoredAgentToken()).toBe('')
      expect(sessionStorage.getItem(AGENT_TOKEN_STORAGE_KEY)).toBeNull()
      expect(localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)).toBeNull()
    })
  })

  describe('end-to-end memory-only workflow', () => {
    it('completes full lifecycle without persisting', () => {
      // 1. Set token in memory
      setAgentToken('ephemeral-token')
      expect(getStoredAgentToken()).toBe('ephemeral-token')
      expect(sessionStorage.length).toBe(0)
      expect(localStorage.length).toBe(0)

      // 2. Simulate page reload
      _resetAgentTokenState()
      expect(getStoredAgentToken()).toBe('')

      // 3. Verify storage is still clean
      expect(sessionStorage.length).toBe(0)
      expect(localStorage.length).toBe(0)
    })
  })
})
