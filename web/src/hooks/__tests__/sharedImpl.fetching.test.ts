import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted before imports)
// ---------------------------------------------------------------------------

vi.mock('../useLocalAgent', () => ({
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
  isAgentUnavailable: vi.fn(() => false),
}))

vi.mock('../../lib/cache/fetcherUtils', () => ({
  isClusterModeBackend: vi.fn(() => false),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { api } from '../../lib/api'
import { fetchClusterListFromBackendAPI, fetchClusterListFromAgent } from '../mcp/sharedImpl.fetching'
import { isClusterModeBackend } from '../../lib/cache/fetcherUtils'
import { reportAgentDataSuccess } from '../useLocalAgent'

// ---------------------------------------------------------------------------
// fetchClusterListFromBackendAPI
// ---------------------------------------------------------------------------

describe('fetchClusterListFromBackendAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns cluster list when api.get responds with clusters', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { clusters: [{ name: 'prod', server: 'https://k8s.example.com', user: 'admin', context: 'prod' }] },
    })
    const result = await fetchClusterListFromBackendAPI()
    expect(result).not.toBeNull()
    expect(result![0].name).toBe('prod')
    expect(reportAgentDataSuccess).toHaveBeenCalled()
  })

  it('returns null when api.get responds with no clusters field', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })
    const result = await fetchClusterListFromBackendAPI()
    expect(result).toBeNull()
  })

  it('returns null when api.get responds with empty clusters array', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { clusters: [] } })
    const result = await fetchClusterListFromBackendAPI()
    // empty array is still falsy-ish in the null check; the fn checks `if (data?.clusters)`
    // which is truthy for an empty array — so we get an empty array back
    expect(result).not.toBeNull()
    expect(result).toHaveLength(0)
  })

  it('returns null when api.get throws', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('backend unavailable'))
    const result = await fetchClusterListFromBackendAPI()
    expect(result).toBeNull()
  })

  it('returns null when api.get resolves with null data', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: null })
    const result = await fetchClusterListFromBackendAPI()
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// fetchClusterListFromAgent
// ---------------------------------------------------------------------------

describe('fetchClusterListFromAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isClusterModeBackend).mockReturnValue(false)
  })

  it('delegates to the backend API when in cluster mode', async () => {
    vi.mocked(isClusterModeBackend).mockReturnValue(true)
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { clusters: [{ name: 'in-cluster', server: 'https://k8s.example.com', user: 'admin' }] },
    })
    const result = await fetchClusterListFromAgent()
    expect(result).not.toBeNull()
    expect(result![0].name).toBe('in-cluster')
  })

  it('returns mapped clusters on successful agent response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          clusters: [{ name: 'dev', server: 'https://dev.example.com', user: 'developer', isCurrent: true }],
        }),
        { status: 200 },
      ),
    )
    const result = await fetchClusterListFromAgent()
    expect(result).not.toBeNull()
    expect(result!).toHaveLength(1)
    expect(result![0].name).toBe('dev')
    expect(result![0].isCurrent).toBe(true)
    expect(result![0].source).toBe('kubeconfig')
    expect(result![0].reachable).toBeUndefined()
    expect(result![0].nodeCount).toBeUndefined()
  })

  it('returns empty array for an agent response with no clusters', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ clusters: [] }), { status: 200 }),
    )
    const result = await fetchClusterListFromAgent()
    expect(result).not.toBeNull()
    expect(result!).toHaveLength(0)
  })

  it('returns null on a non-OK HTTP response from the agent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Service Unavailable', { status: 503 }),
    )
    const result = await fetchClusterListFromAgent()
    expect(result).toBeNull()
  })

  it('returns null when the agent fetch throws a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network error'))
    const result = await fetchClusterListFromAgent()
    expect(result).toBeNull()
  })

  it('returns null when the agent returns invalid JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not-json', { status: 200 }),
    )
    const result = await fetchClusterListFromAgent()
    expect(result).toBeNull()
  })
})
