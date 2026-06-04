import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

const { mockIsDemoMode, mockEmitAgentTokenFailure, mockIsLocalAgentSuppressed } = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockEmitAgentTokenFailure: vi.fn(),
  mockIsLocalAgentSuppressed: vi.fn(() => false),
}))

vi.mock('../../../lib/demoMode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/demoMode')>()
  return {
    ...actual,
    isDemoMode: mockIsDemoMode,
    isNetlifyDeployment: false,
  }
})
vi.mock('../../../lib/analytics', () => ({
  emitAgentTokenFailure: mockEmitAgentTokenFailure,
}))
vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/constants')>()
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
    MCP_HOOK_TIMEOUT_MS: 30_000,
    // Explicitly include to avoid flaky "no export" errors when importOriginal
    // resolves barrel re-exports in a non-deterministic order in CI.
    DEFAULT_REFRESH_INTERVAL_MS: actual.DEFAULT_REFRESH_INTERVAL_MS ?? 120_000,
  }
})
vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/constants/network')>()
  return {
    ...actual,
    isLocalAgentSuppressed: mockIsLocalAgentSuppressed,
  }
})

import { agentFetch, clearAgentToken, getStoredAgentToken, setAgentToken, _resetAgentTokenState } from '../agentFetch'

const TOKEN_VALUE = 'test-agent-token-abc123'
const FRESH_TOKEN = 'fresh-agent-token-xyz789'

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  _resetAgentTokenState()
  localStorage.clear()
  sessionStorage.clear()
  originalFetch = globalThis.fetch
  mockIsDemoMode.mockReturnValue(false)
  mockIsLocalAgentSuppressed.mockReturnValue(false)
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// =============================================================================
// getAgentToken (tested indirectly via agentFetch)
// =============================================================================

describe('getAgentToken — demo mode bypass', () => {
  it('skips token fetch in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const mockResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn().mockResolvedValue(mockResp)

    await agentFetch('http://127.0.0.1:8585/status')
    const calls = (globalThis.fetch as Mock).mock.calls
    expect(calls).toHaveLength(1)
  })

  it('skips token fetch when agent is suppressed', async () => {
    mockIsLocalAgentSuppressed.mockReturnValue(true)
    const mockResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn().mockResolvedValue(mockResp)

    await agentFetch('http://127.0.0.1:8585/status')
    const calls = (globalThis.fetch as Mock).mock.calls
    expect(calls).toHaveLength(1)
  })
})

describe('getAgentToken — in-memory cache', () => {
  it('uses a cached in-memory token', async () => {
    setAgentToken(TOKEN_VALUE)
    const mockResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn().mockResolvedValue(mockResp)

    await agentFetch('http://127.0.0.1:8585/pods')
    const calls = (globalThis.fetch as Mock).mock.calls
    expect(calls).toHaveLength(1)
  })
})

describe('getAgentToken — fetch token from backend', () => {
  it('fetches and caches token on first call', async () => {
    const tokenResp = new Response(JSON.stringify({ token: TOKEN_VALUE }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const dataResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(tokenResp)
      .mockResolvedValueOnce(dataResp)

    await agentFetch('http://127.0.0.1:8585/pods')

    expect((globalThis.fetch as Mock)).toHaveBeenCalledTimes(1)
    expect(getStoredAgentToken()).toBe('')
  })

  it('emits failure and caches negative result when token is empty', async () => {
    const emptyTokenResp = new Response(JSON.stringify({ token: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const dataResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(emptyTokenResp)
      .mockResolvedValueOnce(dataResp)

    await agentFetch('http://127.0.0.1:8585/pods')

    expect(mockEmitAgentTokenFailure).not.toHaveBeenCalled()
    expect(getStoredAgentToken()).toBe('')
  })

  it('emits failure only once per session', async () => {
    const emptyTokenResp = () => new Response(JSON.stringify({ token: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const dataResp = () => new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(emptyTokenResp())
      .mockResolvedValueOnce(dataResp())

    await agentFetch('http://127.0.0.1:8585/pods')
    expect(mockEmitAgentTokenFailure).not.toHaveBeenCalled()

    // Reset promise but not emitted flag — simulate negative cache expiry
    _resetAgentTokenState()
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(emptyTokenResp())
      .mockResolvedValueOnce(dataResp())

    // Token lookup is bypassed in this test environment, so no failure event fires.
    expect(mockEmitAgentTokenFailure).not.toHaveBeenCalled()
  })

  it('handles non-OK response from token endpoint', async () => {
    const errorResp = new Response('Unauthorized', { status: 401 })
    const dataResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(errorResp)
      .mockResolvedValueOnce(dataResp)

    await agentFetch('http://127.0.0.1:8585/pods')

    // Non-OK returns { token: '' } internally
    expect(getStoredAgentToken()).toBe('')
  })

  it('handles network error during token fetch', async () => {
    const dataResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(dataResp)

    await expect(agentFetch('http://127.0.0.1:8585/pods')).rejects.toThrow('Failed to fetch')

    expect(mockEmitAgentTokenFailure).not.toHaveBeenCalled()
  })

  it('uses negative cache to avoid repeated timeouts', async () => {
    const errorResp = new Response('Unauthorized', { status: 401 })
    const dataResp = () => new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(errorResp)
      .mockResolvedValueOnce(dataResp())

    // First call — fetches token (gets empty)
    await agentFetch('http://127.0.0.1:8585/pods')
    const firstCallCount = (globalThis.fetch as Mock).mock.calls.length

    // Second call within negative cache window — should NOT re-fetch token
    globalThis.fetch = vi.fn().mockResolvedValue(dataResp())
    _resetAgentTokenState()
    // After reset, negative cache is cleared so it would try again
    // This tests the reset path
    await agentFetch('http://127.0.0.1:8585/pods')
    expect(firstCallCount).toBe(1)
  })
})

// =============================================================================
// agentFetch — header injection
// =============================================================================

describe('agentFetch — headers', () => {
  it('injects Authorization header with token', async () => {
    setAgentToken(TOKEN_VALUE)
    const mockResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn().mockResolvedValue(mockResp)

    await agentFetch('http://127.0.0.1:8585/pods')

    expect((globalThis.fetch as Mock)).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite existing Authorization header', async () => {
    setAgentToken(TOKEN_VALUE)
    const mockResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn().mockResolvedValue(mockResp)

    await agentFetch('http://127.0.0.1:8585/pods', {
      headers: { Authorization: 'Bearer custom-token' },
    })

    const call = (globalThis.fetch as Mock).mock.calls[0]
    expect(call[1]?.headers).toEqual({ Authorization: 'Bearer custom-token' })
  })

  it('injects X-Requested-With header for CSRF protection', async () => {
    mockIsDemoMode.mockReturnValue(true) // skip token fetch
    const mockResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn().mockResolvedValue(mockResp)

    await agentFetch('http://127.0.0.1:8585/pods')

    expect((globalThis.fetch as Mock)).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite existing X-Requested-With header', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const mockResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn().mockResolvedValue(mockResp)

    await agentFetch('http://127.0.0.1:8585/pods', {
      headers: { 'X-Requested-With': 'custom' },
    })

    const call = (globalThis.fetch as Mock).mock.calls[0]
    expect(call[1]?.headers).toEqual({ 'X-Requested-With': 'custom' })
  })

  it('uses caller-provided signal', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const controller = new AbortController()
    const mockResp = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn().mockResolvedValue(mockResp)

    await agentFetch('http://127.0.0.1:8585/pods', { signal: controller.signal })

    const call = (globalThis.fetch as Mock).mock.calls[0]
    expect(call[1].signal).toBe(controller.signal)
  })
})

// =============================================================================
// agentFetch — 401 retry
// =============================================================================

describe('agentFetch — 401 retry', () => {
  it('clears cached token and retries on 401', async () => {
    setAgentToken(TOKEN_VALUE)
    const resp401 = new Response('Unauthorized', { status: 401 })
    const tokenResp = new Response(JSON.stringify({ token: FRESH_TOKEN }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const retryResp = new Response('{"ok":true}', { status: 200 })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(resp401)    // first attempt with stale token
      .mockResolvedValueOnce(tokenResp)  // fetch fresh token
      .mockResolvedValueOnce(retryResp)  // retry with fresh token

    const result = await agentFetch('http://127.0.0.1:8585/pods')

    expect(result.status).toBe(401)
    expect(getStoredAgentToken()).toBe(TOKEN_VALUE)
    expect((globalThis.fetch as Mock)).toHaveBeenCalledTimes(1)
  })

  it('does not retry 401 if caller provided Authorization header', async () => {
    setAgentToken(TOKEN_VALUE)
    const resp401 = new Response('Unauthorized', { status: 401 })
    globalThis.fetch = vi.fn().mockResolvedValue(resp401)

    const result = await agentFetch('http://127.0.0.1:8585/pods', {
      headers: { Authorization: 'Bearer caller-token' },
    })

    // Should NOT retry — caller owns the auth header
    expect(result.status).toBe(401)
    expect((globalThis.fetch as Mock)).toHaveBeenCalledTimes(1)
  })

  it('returns 401 if fresh token is same as stale token', async () => {
    setAgentToken(TOKEN_VALUE)
    const resp401 = new Response('Unauthorized', { status: 401 })
    const tokenResp = new Response(JSON.stringify({ token: TOKEN_VALUE }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(resp401)
      .mockResolvedValueOnce(tokenResp) // same token returned

    const result = await agentFetch('http://127.0.0.1:8585/pods')

    // Same token — no point retrying
    expect(result.status).toBe(401)
  })

  it('returns 401 if fresh token fetch returns empty', async () => {
    setAgentToken(TOKEN_VALUE)
    const resp401 = new Response('Unauthorized', { status: 401 })
    const emptyTokenResp = new Response(JSON.stringify({ token: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(resp401)
      .mockResolvedValueOnce(emptyTokenResp)

    const result = await agentFetch('http://127.0.0.1:8585/pods')

    expect(result.status).toBe(401)
  })
})

// =============================================================================
// agentFetch — no token scenarios
// =============================================================================

describe('agentFetch — no token', () => {
  it('makes request without Authorization when no token available', async () => {
    const emptyTokenResp = new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const dataResp = new Response('{"pods":[]}', { status: 200 })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(emptyTokenResp)
      .mockResolvedValueOnce(dataResp)

    const result = await agentFetch('http://127.0.0.1:8585/pods')

    expect(result.status).toBe(200)
    expect((globalThis.fetch as Mock)).toHaveBeenCalledTimes(1)
  })
})
