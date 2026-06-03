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

describe('getWsAuthParams', () => {
  let getWsAuthParams: (url: string) => Promise<{ url: string; protocols: string[] }>

  beforeEach(async () => {
    localStorage.clear()
    sessionStorage.clear()
    mockEmitWsAuthMissing.mockClear()
    mockGetAgentToken.mockReset()
    mockGetAgentToken.mockImplementation(async () => sessionStorage.getItem('kc-agent-token') || '')
    vi.resetModules()
    const mod = await import('../wsAuth')
    getWsAuthParams = mod.getWsAuthParams
  })

  it('returns the original URL and bearer protocol when token exists', async () => {
    sessionStorage.setItem('kc-agent-token', 'my-secret-token')
    const result = await getWsAuthParams('ws://localhost:8585/ws')
    expect(result).toEqual({
      url: 'ws://localhost:8585/ws',
      protocols: ['bearer.my-secret-token'],
    })
  })

  it('preserves URL query params and avoids query-string token auth', async () => {
    sessionStorage.setItem('kc-agent-token', 'my-token')
    const result = await getWsAuthParams('ws://localhost:8585/ws?foo=bar')
    expect(result).toEqual({
      url: 'ws://localhost:8585/ws?foo=bar',
      protocols: ['bearer.my-token'],
    })
  })

  it('returns empty protocols when no token is available', async () => {
    const result = await getWsAuthParams('ws://localhost:8585/ws')
    expect(result).toEqual({ url: 'ws://localhost:8585/ws', protocols: [] })
  })

  it('does not emit when token is present', async () => {
    sessionStorage.setItem('kc-agent-token', 'valid-token')
    await getWsAuthParams('ws://localhost:8585/ws')
    expect(mockEmitWsAuthMissing).not.toHaveBeenCalled()
  })

  it('emits emitWsAuthMissing when token is missing', async () => {
    await getWsAuthParams('ws://localhost:8585/ws')
    expect(mockEmitWsAuthMissing).toHaveBeenCalledWith('ws://localhost:8585/ws')
    expect(mockEmitWsAuthMissing).toHaveBeenCalledTimes(1)
  })

  it('throttles emit to once per module lifecycle', async () => {
    await getWsAuthParams('ws://localhost:8585/ws')
    await getWsAuthParams('ws://localhost:8585/ws/other')
    expect(mockEmitWsAuthMissing).toHaveBeenCalledTimes(1)
  })
})
