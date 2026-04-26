import { describe, it, expect, beforeEach } from 'vitest'
import { appendWsAuthToken } from '../wsAuth'

describe('appendWsAuthToken', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('appends token as query parameter when token exists', () => {
    localStorage.setItem('token', 'my-secret-token')
    const result = appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toBe('ws://localhost:8585/ws?token=my-secret-token')
  })

  it('uses & separator when URL already has query params', () => {
    localStorage.setItem('token', 'my-token')
    const result = appendWsAuthToken('ws://localhost:8585/ws?foo=bar')
    expect(result).toBe('ws://localhost:8585/ws?foo=bar&token=my-token')
  })

  it('returns original URL when no token in storage', () => {
    const result = appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toBe('ws://localhost:8585/ws')
  })

  it('URL-encodes special characters in token', () => {
    localStorage.setItem('token', 'token with spaces&special=chars')
    const result = appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toContain('token=token%20with%20spaces%26special%3Dchars')
  })
})
