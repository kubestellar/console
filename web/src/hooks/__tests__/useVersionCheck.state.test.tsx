import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import {
    VersionCheckProvider,
    useVersionCheck,
} from '../useVersionCheck'
import { UPDATE_STORAGE_KEYS } from '../../types/updates'
import { makeGitHubRelease, jsonHeaders, isReleasesApiCall } from './useVersionCheck.helpers'


// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

const mockUseLocalAgent = vi.hoisted(() =>
    vi.fn(() => ({
        isConnected: false,
        health: null as Record<string, unknown> | null,
        refresh: vi.fn(),
    }))
)

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/api', () => ({
  authFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../useLocalAgent', () => ({
    useLocalAgent: mockUseLocalAgent,
}))

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
    emitSessionContext: vi.fn(),
}
))

function wrapper({ children }: { children: React.ReactNode }) {
    return <VersionCheckProvider>{children}</VersionCheckProvider>
}

describe('loadChannel defaults', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('defaults to developer channel on localhost', () => {
        // jsdom defaults to localhost, so no channel stored → developer
        const { result } = renderHook(() => useVersionCheck(), { wrapper })
        expect(result.current.channel).toBe('developer')
    })

    it('loads stored channel from localStorage', () => {
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'unstable')
        const { result } = renderHook(() => useVersionCheck(), { wrapper })
        expect(result.current.channel).toBe('unstable')
    })
})


describe('loadCache edge cases', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('recovers gracefully when cache contains invalid JSON', async () => {
        localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, 'not-json!')

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => [makeGitHubRelease({ tag_name: 'v1.0.0' })],
        }))

        // Should not throw during mount
        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        await waitFor(() => {
            expect(result.current.releases.length).toBe(1)
        })
    })
})


describe('installMethod and channel auto-reset', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        mockUseLocalAgent.mockReturnValue({
            isConnected: false,
            health: null,
            refresh: vi.fn(),
        })
    })

    it('syncs install method from agent health', async () => {
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')

        mockUseLocalAgent.mockReturnValue({
            isConnected: true,
            health: { install_method: 'binary', hasClaude: true },
            refresh: vi.fn(),
        })

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => ({ install_method: 'binary' }),
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await waitFor(() => {
            expect(result.current.installMethod).toBe('binary')
            expect(result.current.hasCodingAgent).toBe(true)
        })
    })

    it('resets channel from developer to stable when install method is not dev', async () => {
        // Start with developer channel but agent reports binary install
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'developer')

        mockUseLocalAgent.mockReturnValue({
            isConnected: true,
            health: { install_method: 'binary', hasClaude: false },
            refresh: vi.fn(),
        })

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => ({ install_method: 'binary' }),
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await waitFor(() => {
            // Channel should be auto-reset to stable
            expect(result.current.channel).toBe('stable')
        })
    })
})


describe('setAutoUpdateEnabled', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('persists enabled state to localStorage', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.setAutoUpdateEnabled(true)
        })

        expect(result.current.autoUpdateEnabled).toBe(true)
        expect(localStorage.getItem(UPDATE_STORAGE_KEYS.AUTO_UPDATE_ENABLED)).toBe('true')
    })

    it('handles agent sync failure gracefully', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('agent unavailable')))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // Should not throw
        await act(async () => {
            await result.current.setAutoUpdateEnabled(false)
        })

        expect(result.current.autoUpdateEnabled).toBe(false)
        expect(localStorage.getItem(UPDATE_STORAGE_KEYS.AUTO_UPDATE_ENABLED)).toBe('false')
    })
})


describe('checkForUpdates developer channel routing', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'developer')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        mockUseLocalAgent.mockReturnValue({
            isConnected: false,
            health: null,
            refresh: vi.fn(),
        })
    })

    it('uses fetchAutoUpdateStatus when agent supports auto-update', async () => {
        mockUseLocalAgent.mockReturnValue({
            isConnected: true,
            health: { install_method: 'dev', hasClaude: false },
            refresh: vi.fn(),
        })

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => ({
                installMethod: 'dev',
                repoPath: '/test',
                currentSHA: 'aaa',
                latestSHA: 'bbb',
                hasUpdate: false,
                hasUncommittedChanges: false,
                autoUpdateEnabled: false,
                channel: 'developer',
                lastUpdateTime: null,
                lastUpdateResult: null,
                updateInProgress: false,
            }),
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.checkForUpdates()
        })

        // Should have called the auto-update status endpoint
        const statusCalls = mockFetch.mock.calls.filter(
            (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/auto-update/status')
        )
        expect(statusCalls.length).toBeGreaterThan(0)
    })

    it('falls back to fetchLatestMainSHA when agent does not support auto-update', async () => {
        mockUseLocalAgent.mockReturnValue({
            isConnected: false,
            health: null,
            refresh: vi.fn(),
        })

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => ({ object: { sha: 'abc123' } }),
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.checkForUpdates()
        })

        // Should have called the main SHA endpoint
        const shaCalls = mockFetch.mock.calls.filter(
            (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/git/ref/heads/main')
        )
        expect(shaCalls.length).toBeGreaterThan(0)
    })
})


describe('checkForUpdates lastChecked guard', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('skips fetch when lastChecked is within MIN_CHECK_INTERVAL even without cache', async () => {
        // Set lastChecked to now, but don't set a cache
        localStorage.setItem(UPDATE_STORAGE_KEYS.LAST_CHECK, String(Date.now()))

        const mockFetch = vi.fn()
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.checkForUpdates()
        })

        // No GitHub releases API calls should be made
        const githubCalls = mockFetch.mock.calls.filter(isReleasesApiCall)
        expect(githubCalls.length).toBe(0)
    })
})


describe('backend /health install method detection', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('fetches install_method from backend /health on mount', async () => {
        const mockFetch = vi.fn().mockImplementation((url: string) => {
            if (url === '/health') {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: jsonHeaders(),
                    json: async () => ({ install_method: 'helm' }),
                })
            }
            return Promise.resolve({ ok: true, status: 200, headers: jsonHeaders(), json: async () => [] })
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await waitFor(() => {
            expect(result.current.installMethod).toBe('helm')
        })
    })

    it('handles backend /health failure gracefully (no throw)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('backend not available')))

        // Should not throw
        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // Install method should remain the default
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50))
        })

        expect(typeof result.current.installMethod).toBe('string')
    })
})



