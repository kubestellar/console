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
    // Reset module to clear the wsAuthMissingEmitted flag
    vi.resetModules()
    const mod = await import('../wsAuth')
    getWsAuthParams = mod.getWsAuthParams
  })

  it('returns URL unchanged and token in protocols when token exists', async () => {
    sessionStorage.setItem('kc-agent-token', 'my-secret-token')
    const result = await getWsAuthParams('ws://localhost:8585/ws')
    expect(result.url).toBe('ws://localhost:8585/ws')
    expect(result.protocols).toEqual(['bearer.my-secret-token'])
  })

  it('returns empty protocols when no token in storage', async () => {
    const result = await getWsAuthParams('ws://localhost:8585/ws')
    expect(result.url).toBe('ws://localhost:8585/ws')
    expect(result.protocols).toEqual([])
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

  it('never puts token in the URL', async () => {
    sessionStorage.setItem('kc-agent-token', 'secret')
    const result = await getWsAuthParams('ws://localhost:8585/ws')
    expect(result.url).not.toContain('secret')
    expect(result.url).not.toContain('token=')
  })
})
