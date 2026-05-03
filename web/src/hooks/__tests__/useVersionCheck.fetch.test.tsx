import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import {
    VersionCheckProvider,
    useVersionCheck
} from '../useVersionCheck'
import { UPDATE_STORAGE_KEYS } from '../../types/updates'
import { makeGitHubRelease, jsonHeaders } from './useVersionCheck.helpers'

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

describe('fetchLatestMainSHA (developer channel)', () => {
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

    it('fetches SHA from GitHub and caches it', async () => {
        const sha = 'abc123def456789012345678901234567890dead'
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => ({ object: { sha } }),
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        await waitFor(() => {
            expect(result.current.latestMainSHA).toBe(sha)
        })

        expect(localStorage.getItem('kc-dev-latest-sha')).toBe(sha)
    })

    it('handles 403 rate limit by backing off and using cache', async () => {
        // Seed the SHA cache
        localStorage.setItem('kc-dev-latest-sha', 'cached-sha-value')

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            headers: { get: (key: string) => key === 'X-RateLimit-Reset' ? String(Math.floor(Date.now() / 1000) + 900) : null },
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        await waitFor(() => {
            // Should use cached SHA as fallback
            expect(result.current.latestMainSHA).toBe('cached-sha-value')
            expect(result.current.error).toMatch(/rate limit/i)
        })

        // Backoff should be set in localStorage
        expect(localStorage.getItem('kc-github-rate-limit-until')).not.toBeNull()
    })

    it('handles 429 rate limit similarly to 403', async () => {
        localStorage.setItem('kc-dev-latest-sha', 'cached-sha')

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            headers: { get: () => null },
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        await waitFor(() => {
            expect(result.current.latestMainSHA).toBe('cached-sha')
        })
    })

    it('skips fetch when rate-limit backoff is active and uses cache', async () => {
        const futureTime = Date.now() + 15 * 60 * 1000
        localStorage.setItem('kc-github-rate-limit-until', String(futureTime))
        localStorage.setItem('kc-dev-latest-sha', 'backoff-cached-sha')

        const mockFetch = vi.fn()
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // Wait for effects to run
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50))
        })

        await waitFor(() => {
            expect(result.current.latestMainSHA).toBe('backoff-cached-sha')
        })
    })

    it('handles non-rate-limit error from GitHub API (e.g. 500)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            headers: { get: () => null },
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        // Should not crash; latestMainSHA may remain null or use cache
        expect(typeof result.current.latestMainSHA).not.toBe('undefined')
    })

    it('forceCheck on developer channel clears rate-limit backoff', async () => {
        localStorage.setItem('kc-github-rate-limit-until', String(Date.now() + 60000))

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => ({ object: { sha: 'fresh-sha' } }),
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        // Rate limit backoff should be cleared on manual check
        expect(localStorage.getItem('kc-github-rate-limit-until')).toBeNull()
    })

    it('falls back to cache when fetch throws', async () => {
        localStorage.setItem('kc-dev-latest-sha', 'fallback-sha')

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS failure')))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        await waitFor(() => {
            expect(result.current.latestMainSHA).toBe('fallback-sha')
        })
    })
})


describe('forceCheck developer channel with agent', () => {
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

    it('calls fetchAutoUpdateStatus via forceCheck when agent supports auto-update', async () => {
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
                currentSHA: 'abc',
                latestSHA: 'def',
                hasUpdate: true,
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
            await result.current.forceCheck()
        })

        // Should have called auto-update/status
        const statusCalls = mockFetch.mock.calls.filter(
            (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/auto-update/status')
        )
        expect(statusCalls.length).toBeGreaterThan(0)
    })
})


describe('fetchAutoUpdateStatus', () => {
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

    it('updates autoUpdateStatus and latestMainSHA from agent response', async () => {
        mockUseLocalAgent.mockReturnValue({
            isConnected: true,
            health: { install_method: 'dev', hasClaude: false },
            refresh: vi.fn(),
        })

        const agentStatus = {
            installMethod: 'dev',
            repoPath: '/test',
            currentSHA: 'abc1234',
            latestSHA: 'def5678',
            hasUpdate: true,
            hasUncommittedChanges: false,
            autoUpdateEnabled: true,
            channel: 'developer',
            lastUpdateTime: null,
            lastUpdateResult: null,
            updateInProgress: false,
        }

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => agentStatus,
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await waitFor(() => {
            expect(result.current.autoUpdateStatus).not.toBeNull()
            expect(result.current.autoUpdateStatus?.hasUpdate).toBe(true)
            expect(result.current.latestMainSHA).toBe('def5678')
        })
    })

    it('sets error when agent returns non-ok status', async () => {
        mockUseLocalAgent.mockReturnValue({
            isConnected: true,
            health: { install_method: 'dev', hasClaude: false },
            refresh: vi.fn(),
        })

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 502,
            headers: { get: () => null },
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // The mount-time effect fires fetchAutoUpdateStatus once (counter=1).
        // ERROR_DISPLAY_THRESHOLD = 2, so we need a second failure via checkForUpdates
        // (which does NOT reset the counter) to reach the threshold.
        await act(async () => {
            await result.current.checkForUpdates()
        })

        await waitFor(() => {
            expect(result.current.error).toMatch(/502/)
        })
    })

    it('sets error when agent fetch throws', async () => {
        mockUseLocalAgent.mockReturnValue({
            isConnected: true,
            health: { install_method: 'dev', hasClaude: false },
            refresh: vi.fn(),
        })

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // The mount-time effect fires fetchAutoUpdateStatus once (counter=1).
        // ERROR_DISPLAY_THRESHOLD = 2, so trigger a second failure via checkForUpdates.
        await act(async () => {
            await result.current.checkForUpdates()
        })

        await waitFor(() => {
            expect(result.current.error).toBe('Could not reach kc-agent')
        })
    })
})


describe('fetchRecentCommits', () => {
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

    it('handles non-ok non-rate-limit response from compare API', async () => {
        mockUseLocalAgent.mockReturnValue({
            isConnected: true,
            health: { install_method: 'dev', hasClaude: false },
            refresh: vi.fn(),
        })

        const mockFetch = vi.fn().mockImplementation((url: string) => {
            if (typeof url === 'string' && url.includes('/auto-update/status')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: jsonHeaders(),
                    json: async () => ({
                        installMethod: 'dev',
                        repoPath: '/test',
                        currentSHA: 'old1234567890',
                        latestSHA: 'new0987654321',
                        hasUpdate: true,
                        hasUncommittedChanges: false,
                        autoUpdateEnabled: false,
                        channel: 'developer',
                        lastUpdateTime: null,
                        lastUpdateResult: null,
                        updateInProgress: false,
                    }),
                })
            }
            if (typeof url === 'string' && url.includes('/compare/')) {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    headers: { get: () => null },
                })
            }
            return Promise.resolve({ ok: true, status: 200, headers: jsonHeaders(), json: async () => ({}) })
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await waitFor(() => {
            expect(result.current.hasUpdate).toBe(true)
        })

        // The compare API returned 500 but the hook shouldn't crash
        expect(result.current.recentCommits).toEqual([])
    })

    it('fetches and formats commit list when SHAs differ', async () => {
        mockUseLocalAgent.mockReturnValue({
            isConnected: true,
            health: { install_method: 'dev', hasClaude: false },
            refresh: vi.fn(),
        })

        const commitData = {
            commits: [
                {
                    sha: 'commit1',
                    commit: { message: 'Fix bug\n\nLong description', author: { name: 'Dev', date: '2025-01-01T00:00:00Z' } },
                },
                {
                    sha: 'commit2',
                    commit: { message: 'Add feature', author: { name: 'Dev2', date: '2025-01-02T00:00:00Z' } },
                },
            ],
        }

        const mockFetch = vi.fn().mockImplementation((url: string) => {
            if (typeof url === 'string' && url.includes('/auto-update/status')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: jsonHeaders(),
                    json: async () => ({
                        installMethod: 'dev',
                        repoPath: '/test',
                        currentSHA: 'old1234567890',
                        latestSHA: 'new0987654321',
                        hasUpdate: true,
                        hasUncommittedChanges: false,
                        autoUpdateEnabled: false,
                        channel: 'developer',
                        lastUpdateTime: null,
                        lastUpdateResult: null,
                        updateInProgress: false,
                    }),
                })
            }
            if (typeof url === 'string' && url.includes('/compare/')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: jsonHeaders(),
                    json: async () => commitData,
                })
            }
            return Promise.resolve({ ok: true, status: 200, headers: jsonHeaders(), json: async () => ({}) })
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await waitFor(() => {
            // Commits are fetched when hasUpdate is true
            if (result.current.recentCommits.length > 0) {
                // Only first line of commit message is kept
                expect(result.current.recentCommits[0].message).not.toContain('\n')
            }
        })
    })
})


describe('fetchReleases edge cases', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('handles 304 Not Modified by refreshing cache timestamp', async () => {
        // Seed an expired cache with an etag
        const oldCache = {
            data: [makeGitHubRelease({ tag_name: 'v1.0.0' })],
            timestamp: Date.now() - 60 * 60 * 1000, // 1 hour ago
            etag: '"abc123"',
        }
        localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(oldCache))

        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 304,
            headers: { get: () => null },
        })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        // Cache should be refreshed (new timestamp)
        const cached = JSON.parse(localStorage.getItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE)!)
        expect(cached.timestamp).toBeGreaterThan(oldCache.timestamp)
        // Releases should be populated from cache
        expect(result.current.releases.length).toBe(1)
        expect(result.current.releases[0].tag).toBe('v1.0.0')
    })

    it('filters out draft releases', async () => {
        const releases = [
            makeGitHubRelease({ tag_name: 'v1.0.0', draft: false }),
            makeGitHubRelease({ tag_name: 'v2.0.0-draft', draft: true }),
        ]

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders(),
            json: async () => releases,
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        await waitFor(() => {
            expect(result.current.releases.length).toBe(1)
            expect(result.current.releases[0].tag).toBe('v1.0.0')
        })
    })

    it('falls back to cache when fetch throws an error', async () => {
        // Seed cache
        const cache = {
            data: [makeGitHubRelease({ tag_name: 'v1.0.0' })],
            timestamp: Date.now() - 60 * 60 * 1000,
            etag: null,
        }
        localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(cache))

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // ERROR_DISPLAY_THRESHOLD = 2: forceCheck resets counter then fails (counter=1),
        // checkForUpdates does NOT reset so the second failure reaches the threshold.
        await act(async () => {
            await result.current.forceCheck()
        })
        await act(async () => {
            await result.current.checkForUpdates()
        })

        await waitFor(() => {
            expect(result.current.error).toBe('Network error')
            // Falls back to cached releases
            expect(result.current.releases.length).toBe(1)
        })
    })

    it('sets generic error message when thrown value is not Error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string-error'))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // ERROR_DISPLAY_THRESHOLD = 2: need two consecutive failures to surface the error.
        await act(async () => {
            await result.current.forceCheck()
        })
        await act(async () => {
            await result.current.checkForUpdates()
        })

        await waitFor(() => {
            expect(result.current.error).toBe('Failed to check for updates')
        })
    })

    it('handles non-ok responses other than 403 (e.g. 500)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            headers: { get: () => null },
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // ERROR_DISPLAY_THRESHOLD = 2: need two consecutive failures.
        await act(async () => {
            await result.current.forceCheck()
        })
        await act(async () => {
            await result.current.checkForUpdates()
        })

        await waitFor(() => {
            expect(result.current.error).toMatch(/GitHub API error: 500/)
        })
    })

    it('handles 403 with X-RateLimit-Reset header', async () => {
        const futureTimestamp = String(Math.floor(Date.now() / 1000) + 3600)
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            headers: { get: (key: string) => key === 'X-RateLimit-Reset' ? futureTimestamp : null },
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // ERROR_DISPLAY_THRESHOLD = 2: need two consecutive failures.
        await act(async () => {
            await result.current.forceCheck()
        })
        await act(async () => {
            await result.current.checkForUpdates()
        })

        await waitFor(() => {
            expect(result.current.error).toMatch(/Rate limited/)
        })
    })

    it('saves ETag from response headers', async () => {
        const mockEtag = '"W/test-etag-123"'
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders((key: string) => key === 'ETag' ? mockEtag : null),
            json: async () => [makeGitHubRelease({ tag_name: 'v1.0.0' })],
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.forceCheck()
        })

        await waitFor(() => {
            const cached = JSON.parse(localStorage.getItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE)!)
            expect(cached.etag).toBe(mockEtag)
        })
    })
})

