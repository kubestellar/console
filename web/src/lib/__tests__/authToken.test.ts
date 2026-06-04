import { beforeEach, describe, expect, it } from 'vitest'

import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from '../authToken'
import { STORAGE_KEY_TOKEN } from '../constants/storage'

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
