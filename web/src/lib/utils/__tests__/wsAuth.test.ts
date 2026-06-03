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

describe('wsAuth helpers', () => {
  let appendWsAuthToken: (url: string) => Promise<string>
  let getAuthenticatedWebSocketProtocols: (url: string) => Promise<string[] | undefined>
  let openAuthenticatedWebSocket: (url: string) => Promise<WebSocket>

  beforeEach(async () => {
    localStorage.clear()
    mockEmitWsAuthMissing.mockClear()
    mockGetAgentToken.mockReset()
    mockGetAgentToken.mockImplementation(async () => localStorage.getItem('kc-agent-token') || '')
    vi.resetModules()
    const mod = await import('../wsAuth')
    appendWsAuthToken = mod.appendWsAuthToken
    getAuthenticatedWebSocketProtocols = mod.getAuthenticatedWebSocketProtocols
    openAuthenticatedWebSocket = mod.openAuthenticatedWebSocket
  })

  it('returns the original URL when token exists', async () => {
    localStorage.setItem('kc-agent-token', 'my-secret-token')
    const result = await appendWsAuthToken('ws://localhost:8585/ws')
    expect(result).toBe('ws://localhost:8585/ws')
  })

  it('returns encoded protocol headers when token exists', async () => {
    localStorage.setItem('kc-agent-token', 'my-secret-token')
    const protocols = await getAuthenticatedWebSocketProtocols('ws://localhost:8585/ws')

    expect(protocols?.[0]).toBe('kc-agent.v1')
    expect(protocols?.[1]).toMatch(/^kc-agent-token\.[A-Za-z0-9_-]+$/)
  })

  it('returns undefined protocols when no token in storage', async () => {
    const protocols = await getAuthenticatedWebSocketProtocols('ws://localhost:8585/ws')
    expect(protocols).toBeUndefined()
  })

  it('opens the socket with auth protocols when token exists', async () => {
    localStorage.setItem('kc-agent-token', 'valid-token')
    const webSocketSpy = vi.fn(function MockWebSocket(this: WebSocket, _url: string, _protocols?: string | string[]) {
      return this
    })
    vi.stubGlobal('WebSocket', webSocketSpy)

    await openAuthenticatedWebSocket('ws://localhost:8585/ws')

    expect(webSocketSpy).toHaveBeenCalledWith(
      'ws://localhost:8585/ws',
      expect.arrayContaining(['kc-agent.v1', expect.stringMatching(/^kc-agent-token\./)]),
    )
  })

  it('does not emit when token is present', async () => {
    localStorage.setItem('kc-agent-token', 'valid-token')
    await getAuthenticatedWebSocketProtocols('ws://localhost:8585/ws')
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
