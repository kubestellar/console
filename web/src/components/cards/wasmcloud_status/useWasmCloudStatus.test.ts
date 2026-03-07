import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWasmCloudStatus } from './useWasmCloudStatus'
import { useCache } from '../../../lib/cache'
import { api } from '../../../lib/api'

// Mock useCache
vi.mock('../../../lib/cache', () => ({
    useCache: vi.fn(),
    REFRESH_RATES: { default: 120000 },
}))

// Mock api
vi.mock('../../../lib/api', () => ({
    api: {
        get: vi.fn(),
    },
}))

describe('useWasmCloudStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uses default API endpoints and no custom refresh interval when no config is provided', async () => {
        vi.mocked(useCache).mockReturnValue({
            data: { totalHosts: 0 },
            isLoading: true,
            isRefreshing: false,
            error: null,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
        })

        renderHook(() => useWasmCloudStatus())

        expect(useCache).toHaveBeenCalledWith(expect.objectContaining({
            refreshInterval: undefined,
        }))

        const cacheOptions = vi.mocked(useCache).mock.calls[0][0]
        const fetcher = cacheOptions.fetcher

        vi.mocked(api.get).mockResolvedValue({ data: { hosts: [], actors: [] } })

        await fetcher()

        expect(api.get).toHaveBeenCalledWith('/api/mcp/wasmcloud/hosts')
        expect(api.get).toHaveBeenCalledWith('/api/mcp/wasmcloud/actors')
    })

    it('uses custom API endpoints and refresh interval from config', async () => {
        vi.mocked(useCache).mockReturnValue({
            data: { totalHosts: 0 },
            isLoading: true,
            isRefreshing: false,
            error: null,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
        })

        const config = {
            hostsApi: '/custom/hosts',
            actorsApi: '/custom/actors',
            refreshInterval: 60,
        }

        renderHook(() => useWasmCloudStatus(config))

        expect(useCache).toHaveBeenCalledWith(expect.objectContaining({
            refreshInterval: 60000,
        }))

        const cacheOptions = vi.mocked(useCache).mock.calls[0][0]
        const fetcher = cacheOptions.fetcher

        vi.mocked(api.get).mockResolvedValue({ data: { hosts: [], actors: [] } })

        await fetcher()

        expect(api.get).toHaveBeenCalledWith('/custom/hosts')
        expect(api.get).toHaveBeenCalledWith('/custom/actors')
    })
})
