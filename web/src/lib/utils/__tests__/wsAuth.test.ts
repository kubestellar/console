import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockEmitWsAuthMissing = vi.fn()

vi.mock('../../analytics', () => ({
  emitWsAuthMissing: mockEmitWsAuthMissing,
}))

describe('appendWsAuthToken', () => {
  let appendWsAuthToken: (url: string) => string

  beforeEach(async () => {
    localStorage.clear()
    mockEmitWsAuthMissing.mockClear()
    // Reset module to clear the wsAuthMissingEmitted flag
    vi.resetModules()
    const mod = await import('../wsAuth')
    appendWsAuthToken = mod.appendWsAuthToken
  })

  it('appends token as query parameter when token exists', () => {
    localStorage.setItem('kc-agent-token', 'my-secret-token')
    const result = appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toBe('ws://localhost:8585/ws?token=my-secret-token')
  })

  it('uses & separator when URL already has query params', () => {
    localStorage.setItem('kc-agent-token', 'my-token')
    const result = appendWsAuthToken('ws://localhost:8585/ws?foo=bar')
    expect(result).toBe('ws://localhost:8585/ws?foo=bar&token=my-token')
  })

  it('returns original URL when no token in storage', () => {
    const result = appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toBe('ws://localhost:8585/ws')
  })

  it('URL-encodes special characters in token', () => {
    localStorage.setItem('kc-agent-token', 'token with spaces&special=chars')
    const result = appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toContain('token=token%20with%20spaces%26special%3Dchars')
  })

  it('does not emit when token is present', () => {
    localStorage.setItem('kc-agent-token', 'valid-token')
    appendWsAuthToken('ws://localhost:8585/ws')
    expect(mockEmitWsAuthMissing).not.toHaveBeenCalled()
  })

  it('emits emitWsAuthMissing when token is missing', () => {
    appendWsAuthToken('ws://localhost:8585/ws')
    expect(mockEmitWsAuthMissing).toHaveBeenCalledWith('ws://localhost:8585/ws')
    expect(mockEmitWsAuthMissing).toHaveBeenCalledTimes(1)
  })

  it('throttles emit to once per module lifecycle', () => {
    appendWsAuthToken('ws://localhost:8585/ws')
    appendWsAuthToken('ws://localhost:8585/ws/other')
    expect(mockEmitWsAuthMissing).toHaveBeenCalledTimes(1)
  })
})
