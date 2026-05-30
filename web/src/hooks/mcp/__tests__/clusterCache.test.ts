import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetLocalAgentURL = vi.hoisted(() => vi.fn(() => 'http://127.0.0.1:8585'))

vi.mock('../agentFetch', () => ({
  getLocalAgentURL: () => mockGetLocalAgentURL(),
}))

import { resolveAgentBase, resolveApiBase, resolveMcpBase } from '../clusterCache'

describe('clusterCache URL resolvers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves API and MCP bases from window.location.origin', () => {
    expect(resolveApiBase()).toBe(window.location.origin)
    expect(resolveMcpBase()).toBe(`${window.location.origin}/api/mcp`)
  })

  it('returns an empty API base when window is unavailable', () => {
    vi.stubGlobal('window', undefined)

    expect(resolveApiBase()).toBe('')
    expect(resolveMcpBase()).toBe('/api/mcp')
  })

  it('delegates agent base resolution to getLocalAgentURL', () => {
    mockGetLocalAgentURL.mockReturnValue('http://localhost:9999')

    expect(resolveAgentBase()).toBe('http://localhost:9999')
    expect(mockGetLocalAgentURL).toHaveBeenCalledTimes(1)
  })
})
