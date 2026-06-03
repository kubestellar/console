import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockEmitWsAuthMissing = vi.fn()
const mockGetAgentToken = vi.fn(async () => '')

vi.mock('../../analytics', () => ({
  emitWsAuthMissing: mockEmitWsAuthMissing,
}))

vi.mock('../../../hooks/mcp/agentFetch', () => ({
  AGENT_TOKEN_STORAGE_KEY: 'kc-agent-token',
  getAgentToken: mockGetAgentToken,
}))

describe('appendWsAuthToken', () => {
  let appendWsAuthToken: (url: string) => Promise<string>
  let sendWsAuthMessage: (ws: Pick<WebSocket, 'send' | 'close' | 'url'>, url?: string) => boolean

  beforeEach(async () => {
    localStorage.clear()
    mockEmitWsAuthMissing.mockClear()
    mockGetAgentToken.mockReset()
    mockGetAgentToken.mockImplementation(async () => localStorage.getItem('kc-agent-token') || '')
    // Reset module to clear the wsAuthMissingEmitted flag
    vi.resetModules()
    const mod = await import('../wsAuth')
    appendWsAuthToken = mod.appendWsAuthToken
    sendWsAuthMessage = mod.sendWsAuthMessage
  })

  it('returns the original URL when token exists', async () => {
    localStorage.setItem('kc-agent-token', 'my-secret-token')
    const result = await appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toBe('ws://localhost:8585/ws')
  })

  it('preserves existing query params without appending the token', async () => {
    localStorage.setItem('kc-agent-token', 'my-token')
    const result = await appendWsAuthToken('ws://localhost:8585/ws?foo=bar')
    expect(result).toBe('ws://localhost:8585/ws?foo=bar')
  })

  it('returns original URL when no token in storage', async () => {
    const result = await appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toBe('ws://localhost:8585/ws')
  })

  it('sends the auth token as the first WebSocket message', () => {
    localStorage.setItem('kc-agent-token', 'token with spaces&special=chars')
    const send = vi.fn()
    const close = vi.fn()

    const result = sendWsAuthMessage({ send, close, url: 'ws://localhost:8585/ws' })

    expect(result).toBe(true)
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth', token: 'token with spaces&special=chars' }))
    expect(close).not.toHaveBeenCalled()
  })

  it('closes the socket when the auth token is missing', () => {
    const send = vi.fn()
    const close = vi.fn()

    const result = sendWsAuthMessage({ send, close, url: 'ws://localhost:8585/ws' })

    expect(result).toBe(false)
    expect(send).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does not emit when token is present', async () => {
    localStorage.setItem('kc-agent-token', 'valid-token')
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
