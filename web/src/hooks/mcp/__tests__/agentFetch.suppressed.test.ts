import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// Regression tests for #24495: when the local kc-agent is suppressed
// (in-cluster / console-live), agentFetch must only short-circuit requests
// that actually target the kc-agent. Same-origin backend calls such as
// `/api/mcp/deployments` previously received a synthetic 503 that never
// occurred on the wire, surfacing as
// "[useDeployments] All fetch sources failed: API error: 503".

const { mockIsLocalAgentSuppressed } = vi.hoisted(() => ({
  mockIsLocalAgentSuppressed: vi.fn(() => true),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/constants/network')>()),
  isLocalAgentSuppressed: mockIsLocalAgentSuppressed,
}))

// The global test setup replaces agentFetch with a passthrough to fetch;
// load the real implementation so the suppression branch is exercised.
const { agentFetch, isSameOriginBackendRequest } =
  await vi.importActual<typeof import('../agentFetch')>('../agentFetch')

const HTTP_OK = 200
const HTTP_SERVICE_UNAVAILABLE = 503
const AGENT_URL = 'http://127.0.0.1:8585/deployments?cluster=a'
const BACKEND_PATH = '/api/mcp/deployments?cluster=a'

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  mockIsLocalAgentSuppressed.mockReturnValue(true)
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('isSameOriginBackendRequest', () => {
  it('treats relative paths as same-origin backend requests', () => {
    expect(isSameOriginBackendRequest(BACKEND_PATH)).toBe(true)
  })

  it('treats absolute URLs on the page origin as backend requests', () => {
    expect(isSameOriginBackendRequest(`${window.location.origin}/api/mcp/pods`)).toBe(true)
    expect(isSameOriginBackendRequest(new URL(`${window.location.origin}/api/mcp/pods`))).toBe(true)
  })

  it('treats kc-agent URLs as non-backend requests', () => {
    expect(isSameOriginBackendRequest(AGENT_URL)).toBe(false)
    expect(isSameOriginBackendRequest(new Request(AGENT_URL))).toBe(false)
  })
})

describe('agentFetch — local agent suppressed', () => {
  it('still fetches same-origin backend URLs and returns the real response', async () => {
    const body = JSON.stringify({ deployments: [{ name: 'web', namespace: 'default' }] })
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(body, {
      status: HTTP_OK,
      headers: { 'Content-Type': 'application/json' },
    }))

    const response = await agentFetch(BACKEND_PATH)

    expect((globalThis.fetch as Mock)).toHaveBeenCalledTimes(1)
    expect((globalThis.fetch as Mock).mock.calls[0][0]).toBe(BACKEND_PATH)
    expect(response.status).toBe(HTTP_OK)
    await expect(response.json()).resolves.toEqual({
      deployments: [{ name: 'web', namespace: 'default' }],
    })
  })

  it('does not attach an agent Authorization header to backend requests', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: HTTP_OK }))

    await agentFetch(BACKEND_PATH)

    const init = (globalThis.fetch as Mock).mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
  })

  it('short-circuits kc-agent URLs with a synthetic 503 without a network call', async () => {
    globalThis.fetch = vi.fn()

    const response = await agentFetch(AGENT_URL)

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    await expect(response.json()).resolves.toMatchObject({ error: 'local_agent_suppressed', url: AGENT_URL })
  })

  it('fetches kc-agent URLs normally when the agent is not suppressed', async () => {
    mockIsLocalAgentSuppressed.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: HTTP_OK }))

    const response = await agentFetch(AGENT_URL)

    expect(response.status).toBe(HTTP_OK)
    expect((globalThis.fetch as Mock).mock.calls.some(call => call[0] === AGENT_URL)).toBe(true)
  })
})
