import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import {
    VersionCheckProvider,
    useVersionCheck
} from '../useVersionCheck'
import { UPDATE_STORAGE_KEYS } from '../../types/updates'
import { makeGitHubRelease, jsonHeaders, isReleasesApiCall, isAutoUpdateStatusCall } from './useVersionCheck.helpers'

declare const __APP_VERSION__: string;

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

vi.mock('../useLocalAgent', () => ({
    useLocalAgent: mockUseLocalAgent,
}))

vi.mock('../../lib/analytics', () => ({
    emitSessionContext: vi.fn(),
}))

function wrapper({ children }: { children: React.ReactNode }) {
    return <VersionCheckProvider>{children}</VersionCheckProvider>
}

describe('cache behaviour', () => {
    const sampleReleases: GitHubRelease[] = [
        makeGitHubRelease({ tag_name: 'v1.2.3' }),
    ]

    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('stores fetched releases in localStorage after a successful fetch', async () => {
        // Force stable channel so forceCheck() calls fetchReleases() rather than fetchLatestMainSHA()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => sampleReleases,
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        await waitFor(() => {
            const cached = localStorage.getItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE)
            expect(cached).not.toBeNull()
            const parsed = JSON.parse(cached!)
            expect(parsed.data).toHaveLength(1)
            expect(parsed.data[0].tag_name).toBe('v1.2.3')
        })
    })

    it('checkForUpdates() uses cached data and skips fetch when cache is fresh', async () => {
        // Set stable channel so checkForUpdates() goes through the releases cache path
        // (without this, jsdom localhost causes loadChannel() to return 'developer', which
        // skips cache entirely and calls fetchLatestMainSHA() — a different code path)
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')

        // Pre-populate a fresh cache (timestamp = now)
        const freshCache = {
            data: sampleReleases,
            timestamp: Date.now(),
            etag: null,
        }
        localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(freshCache))

        const mockFetch = vi.fn()
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.checkForUpdates()
        })

        // fetch should NOT have been called for GitHub releases API
        const githubCalls = mockFetch.mock.calls.filter(isReleasesApiCall)
        expect(githubCalls.length).toBe(0)
    })

    it('forceCheck() calls the GitHub API even when cache is fresh', async () => {
        // Use stable channel so forceCheck() exercises the releases fetch path
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')

        // Pre-populate a fresh cache
        const freshCache = {
            data: sampleReleases,
            timestamp: Date.now(),
            etag: null,
        }
        localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(freshCache))
        // Also set lastChecked to now so cache interval check also passes
        localStorage.setItem(UPDATE_STORAGE_KEYS.LAST_CHECK, String(Date.now()))

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => sampleReleases,
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        await waitFor(() => {
            const githubCalls = mockFetch.mock.calls.filter(isReleasesApiCall)
            expect(githubCalls.length).toBeGreaterThan(0)
        })
    })
})


describe('VersionCheckProvider', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('exports VersionCheckProvider as a function', () => {
        expect(typeof VersionCheckProvider).toBe('function')
    })

    it('useVersionCheck throws when used outside VersionCheckProvider', () => {
        // Suppress expected console error from React
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { })
        expect(() => renderHook(() => useVersionCheck())).toThrow(
            'useVersionCheck must be used within a <VersionCheckProvider>'
        )
        spy.mockRestore()
    })

    it('provides checkForUpdates as a function', () => {
        const { result } = renderHook(() => useVersionCheck(), { wrapper })
        expect(typeof result.current.checkForUpdates).toBe('function')
    })

    it('provides forceCheck as a function', () => {
        const { result } = renderHook(() => useVersionCheck(), { wrapper })
        expect(typeof result.current.forceCheck).toBe('function')
    })

    it('handles GitHub API rate limit (403) gracefully — sets error, does not throw', async () => {
        // Set stable channel so forceCheck() exercises fetchReleases() — the code path
        // that returns a 403 rate-limit error — rather than fetchLatestMainSHA()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')

        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            headers: jsonHeaders(),
            json: async () => ({}),
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // The hook uses ERROR_DISPLAY_THRESHOLD = 2 consecutive failures before
        // surfacing an error. forceCheck() resets the counter, so the first call
        // only reaches 1. A follow-up checkForUpdates() (which does NOT reset)
        // pushes the counter to 2, meeting the threshold.
        await act(async () => {
            await result.current.forceCheck()
        })
        await act(async () => {
            await result.current.checkForUpdates()
        })

        await waitFor(() => {
            expect(result.current.error).not.toBeNull()
            expect(result.current.error).toMatch(/rate limit/i)
        })
    })

    it('hasUpdate is false when latestRelease is null', async () => {
        // Set stable channel so forceCheck() calls fetchReleases(), returning an empty
        // list that produces no latestRelease and therefore hasUpdate === false
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')

        // Empty releases response — no latestRelease
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => [],
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        await waitFor(() => {
            expect(result.current.hasUpdate).toBe(false)
        })
    })

    it('releases array is populated after a successful forceCheck', async () => {
        // Use stable channel so forceCheck() calls fetchReleases() rather than fetchLatestMainSHA()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')

        const stableReleases: GitHubRelease[] = [
            makeGitHubRelease({ tag_name: 'v1.5.0' }),
        ]
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => stableReleases,
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        await waitFor(() => {
            expect(result.current.releases.length).toBeGreaterThan(0)
        })
    })

    it('checkForUpdates calls the GitHub API when cache is stale', async () => {
        // Use stable channel so checkForUpdates() goes through the releases fetch path
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')

        // Set an expired cache (older than 30 minutes)
        const oldCache = {
            data: [makeGitHubRelease()],
            timestamp: Date.now() - 31 * 60 * 1000, // 31 minutes ago
            etag: null,
        }
        localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(oldCache))

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => [makeGitHubRelease({ tag_name: 'v1.9.0' })],
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.checkForUpdates()
        })

        await waitFor(() => {
            const githubCalls = mockFetch.mock.calls.filter(isReleasesApiCall)
            expect(githubCalls.length).toBeGreaterThan(0)
        })
    })
})


describe('toggle-sensitive polling', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        vi.useFakeTimers()

        // Simulate a connected agent that supports auto-update
        mockUseLocalAgent.mockReturnValue({
            isConnected: true,
            health: { install_method: 'dev', hasClaude: false },
            refresh: vi.fn(),
        })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()

        // Reset the mock back to default (disconnected agent) so other test suites
        // that rely on the default behaviour are not affected
        mockUseLocalAgent.mockReturnValue({
            isConnected: false,
            health: null,
            refresh: vi.fn(),
        })
    })

    it('fires an immediate fetchAutoUpdateStatus when autoUpdateEnabled is toggled on', async () => {
        // Start with auto-update disabled
        localStorage.setItem(UPDATE_STORAGE_KEYS.AUTO_UPDATE_ENABLED, 'false')
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'developer')

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => ({
                enabled: true,
                channel: 'developer',
                hasUpdate: false,
                currentSHA: 'abc1234',
                latestSHA: 'abc1234',
            }),
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // Flush any mount-time effects and their micro-tasks
        await act(async () => {
            await vi.runAllTimersAsync()
        })

        // Record the number of auto-update status calls made during mount
        const callsBeforeToggle = mockFetch.mock.calls.filter(isAutoUpdateStatusCall).length

        // Toggle auto-update ON — this should fire an immediate fetch
        await act(async () => {
            await result.current.setAutoUpdateEnabled(true)
        })

        // Flush the effect triggered by the state change
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })

        const callsAfterToggle = mockFetch.mock.calls.filter(isAutoUpdateStatusCall).length

        // At least one new call should have been made immediately (not after 60s)
        expect(callsAfterToggle).toBeGreaterThan(callsBeforeToggle)
    })

    it('periodic poll fires fetchAutoUpdateStatus after AUTO_UPDATE_POLL_MS', async () => {
        // Start with auto-update enabled
        localStorage.setItem(UPDATE_STORAGE_KEYS.AUTO_UPDATE_ENABLED, 'true')
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'developer')

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => ({
                enabled: true,
                channel: 'developer',
                hasUpdate: false,
                currentSHA: 'abc1234',
                latestSHA: 'abc1234',
            }),
        })
        vi.stubGlobal('fetch', mockFetch)

        renderHook(() => useVersionCheck(), { wrapper })

        // Flush mount effects — use advanceTimersByTime to avoid infinite loop
        // since setInterval re-queues forever
        await act(async () => {
            vi.advanceTimersByTime(1)
            await Promise.resolve()
        })

        const callsBeforePoll = mockFetch.mock.calls.filter(isAutoUpdateStatusCall).length

        // Advance past the 60s poll interval (one tick)
        await act(async () => {
            vi.advanceTimersByTime(60_001)
            await Promise.resolve()
        })

        const callsAfterPoll = mockFetch.mock.calls.filter(isAutoUpdateStatusCall).length

        // At least one additional call from the interval
        expect(callsAfterPoll).toBeGreaterThan(callsBeforePoll)
    })
})


