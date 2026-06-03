import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockEmitWsAuthMissing = vi.fn()
const mockGetAgentToken = vi.fn(async () => '')
const mockGetStoredAgentToken = vi.fn(() => '')

vi.mock('../../analytics', () => ({
  emitWsAuthMissing: mockEmitWsAuthMissing,
}))

vi.mock('../../../hooks/mcp/agentFetch', () => ({
  getAgentToken: mockGetAgentToken,
  getStoredAgentToken: mockGetStoredAgentToken,
}))

describe('getWsAuthParams', () => {
  let getWsAuthParams: (url: string) => Promise<{ url: string; protocols: string[] }>

  beforeEach(async () => {
    sessionStorage.clear()
    mockEmitWsAuthMissing.mockClear()
    mockGetAgentToken.mockReset()
    mockGetStoredAgentToken.mockReset()
    mockGetAgentToken.mockImplementation(async () => undefined)
    mockGetStoredAgentToken.mockImplementation(() => sessionStorage.getItem('kc-agent-token') || '')
    vi.resetModules()
    const mod = await import('../wsAuth')
    getWsAuthParams = mod.getWsAuthParams
  })

  it('returns bearer auth protocol when a stored token exists', async () => {
    sessionStorage.setItem('kc-agent-token', 'my-secret-token')
    const result = await getWsAuthParams('ws://localhost:8585/ws')
    expect(result).toEqual({
      url: 'ws://localhost:8585/ws',
      protocols: ['bearer.my-secret-token'],
    })
  })

  it('returns the original URL with no protocols when token is missing', async () => {
    const result = await getWsAuthParams('ws://localhost:8585/ws')
    expect(result).toEqual({
      url: 'ws://localhost:8585/ws',
      protocols: [],
    })
  })

  it('awaits token refresh before reading stored auth state', async () => {
    mockGetAgentToken.mockImplementation(async () => {
      sessionStorage.setItem('kc-agent-token', 'fresh-token')
      return 'fresh-token'
    })

    const result = await getWsAuthParams('ws://localhost:8585/ws')

    expect(mockGetAgentToken).toHaveBeenCalledTimes(1)
    expect(result.protocols).toEqual(['bearer.fresh-token'])
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
