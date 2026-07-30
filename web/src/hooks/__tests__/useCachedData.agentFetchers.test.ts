import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchCiliumStatus } from '../useCachedData/agentFetchers'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'

import { isAgentUnavailable } from '../useLocalAgent'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../useLocalAgent', () => ({
    isAgentUnavailable: vi.fn(() => false),
}))

vi.mock('../mcp/shared', () => ({
    clusterCacheRef: { clusters: [] },
    agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

const originalFetch = globalThis.fetch
const mockIsAgentUnavailable = vi.mocked(isAgentUnavailable)

describe('agentFetchers: fetchCiliumStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
        mockIsAgentUnavailable.mockReturnValue(false)
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    it('returns null when agent is unavailable', async () => {
        mockIsAgentUnavailable.mockReturnValue(true)

        const result = await fetchCiliumStatus()
        expect(result).toBeNull()
    })

    it('returns null when no token is present', async () => {
        localStorage.removeItem(STORAGE_KEY_TOKEN)
        const result = await fetchCiliumStatus()
        expect(result).toBeNull()
    })

    it('returns null when token is demo-token', async () => {
        localStorage.setItem(STORAGE_KEY_TOKEN, 'demo-token')
        const result = await fetchCiliumStatus()
        expect(result).toBeNull()
    })

    it('calls fetch with correct URL and headers', async () => {
        localStorage.setItem(STORAGE_KEY_TOKEN, 'test-token')
        const mockData = { status: 'Healthy', nodes: [] }

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockData,
        })

        const result = await fetchCiliumStatus()

        expect(globalThis.fetch).toHaveBeenCalledWith(
            `${LOCAL_AGENT_HTTP_URL}/cilium-status`,
            expect.objectContaining({
                headers: {
                    Authorization: 'Bearer test-token',
                    Accept: 'application/json',
                },
            })
        )
        expect(result).toEqual(mockData)
    })

    it('returns null on non-ok response', async () => {
        localStorage.setItem(STORAGE_KEY_TOKEN, 'test-token')
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
        })

        const result = await fetchCiliumStatus()
        expect(result).toBeNull()
    })

    it('returns null on fetch error or timeout', async () => {
        localStorage.setItem(STORAGE_KEY_TOKEN, 'test-token')
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('Timeout'))

        const result = await fetchCiliumStatus()
        expect(result).toBeNull()
    })

    it('returns null on invalid JSON response', async () => {
        localStorage.setItem(STORAGE_KEY_TOKEN, 'test-token')
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => { throw new Error('Invalid JSON') },
        })

        const result = await fetchCiliumStatus()
        expect(result).toBeNull()
    })
})
