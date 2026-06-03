import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockEmitWsAuthMissing = vi.fn()
const mockGetAgentToken = vi.fn(async () => '')

vi.mock('../../analytics', () => ({
  emitWsAuthMissing: mockEmitWsAuthMissing,
}))

vi.mock('../../../hooks/mcp/agentFetch', () => ({
  getAgentToken: mockGetAgentToken,
  getStoredAgentToken: () => sessionStorage.getItem('kc-agent-token') || '',
}))

describe('appendWsAuthToken', () => {
  let appendWsAuthToken: (url: string) => Promise<string>

  beforeEach(async () => {
    localStorage.clear()
    sessionStorage.clear()
    mockEmitWsAuthMissing.mockClear()
    mockGetAgentToken.mockReset()
    mockGetAgentToken.mockImplementation(async () => sessionStorage.getItem('kc-agent-token') || '')
    // Reset module to clear the wsAuthMissingEmitted flag
    vi.resetModules()
    const mod = await import('../wsAuth')
    appendWsAuthToken = mod.appendWsAuthToken
  })

  it('appends token as query parameter when token exists', async () => {
    sessionStorage.setItem('kc-agent-token', 'my-secret-token')
    const result = await appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toBe('ws://localhost:8585/ws?token=my-secret-token')
  })

  it('uses & separator when URL already has query params', async () => {
    sessionStorage.setItem('kc-agent-token', 'my-token')
    const result = await appendWsAuthToken('ws://localhost:8585/ws?foo=bar')
    expect(result).toBe('ws://localhost:8585/ws?foo=bar&token=my-token')
  })

  it('returns original URL when no token in storage', async () => {
    const result = await appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toBe('ws://localhost:8585/ws')
  })

  it('URL-encodes special characters in token', async () => {
    sessionStorage.setItem('kc-agent-token', 'token with spaces&special=chars')
    const result = await appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toContain('token=token%20with%20spaces%26special%3Dchars')
  })

  it('does not emit when token is present', async () => {
    sessionStorage.setItem('kc-agent-token', 'valid-token')
    await appendWsAuthToken('ws://localhost:8585/ws')
    expect(mockEmitWsAuthMissing).not.toHaveBeenCalled()
  })

  it('emits emitWsAuthMissing when token is missing', async () => {
    await appendWsAuthToken('ws://localhost:8585/ws')
    expect(mockEmitWsAuthMissing).toHaveBeenCalledWith('ws://localhost:8585/ws')
    expect(mockEmitWsAuthMissing).toHaveBeenCalledTimes(1)
  })

  it('throttles emit to once per module lifecycle', async () => {
    await appendWsAuthToken('ws://localhost:8585/ws')
    await appendWsAuthToken('ws://localhost:8585/ws/other')
    expect(mockEmitWsAuthMissing).toHaveBeenCalledTimes(1)
  })
})
