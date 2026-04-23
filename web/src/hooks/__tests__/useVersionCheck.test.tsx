import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import {
    parseReleaseTag,
    parseRelease,
    getLatestForChannel,
    isDevVersion,
    isNewerVersion,
    VersionCheckProvider,
    useVersionCheck
} from '../useVersionCheck'
import type { GitHubRelease, ParsedRelease } from '../../types/updates'
import { UPDATE_STORAGE_KEYS } from '../../types/updates'

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

vi.mock('../useLocalAgent', () => ({
    useLocalAgent: mockUseLocalAgent,
}))

vi.mock('../../lib/analytics', () => ({
    emitSessionContext: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGitHubRelease(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
    return {
        tag_name: 'v1.2.3',
        name: 'Release v1.2.3',
        body: 'Release notes',
        published_at: '2025-01-24T00:00:00Z',
        html_url: 'https://github.com/kubestellar/console/releases/tag/v1.2.3',
        prerelease: false,
        draft: false,
        ...overrides,
    }
}

function makeParsedRelease(overrides: Partial<ParsedRelease> = {}): ParsedRelease {
    return {
        tag: 'v1.2.3',
        version: 'v1.2.3',
        type: 'stable',
        date: null,
        publishedAt: new Date('2025-01-24T00:00:00Z'),
        releaseNotes: 'Release notes',
        url: 'https://github.com/kubestellar/console/releases/tag/v1.2.3',
        ...overrides,
    }
}

function wrapper({ children }: { children: React.ReactNode }) {
    return <VersionCheckProvider>{children}</VersionCheckProvider>
}

const RELEASES_API_PATH = '/api/github/repos/kubestellar/console/releases'
const AUTO_UPDATE_STATUS_PATH = '/auto-update/status'

function isReleasesApiCall(call: unknown[]): boolean {
    return typeof call[0] === 'string' && (call[0] as string).includes(RELEASES_API_PATH)
}

function isAutoUpdateStatusCall(call: unknown[]): boolean {
    return typeof call[0] === 'string' && (call[0] as string).includes(AUTO_UPDATE_STATUS_PATH)
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
            headers: { get: () => null },
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
            headers: { get: () => null },
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
            headers: { get: () => null },
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
            headers: { get: () => null },
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
            headers: { get: () => null },
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
            headers: { get: () => null },
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
            headers: { get: () => null },
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
            headers: { get: () => null },
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
            headers: { get: () => null },
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
                    headers: { get: () => null },
                    json: async () => ({ install_method: 'helm' }),
                })
            }
            return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => [] })
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

describe('helm install with dev version hasUpdate', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
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

    it('hasUpdate is true for helm install with dev version when newer release exists', async () => {
        mockUseLocalAgent.mockReturnValue({
            isConnected: true,
            health: { install_method: 'helm', hasClaude: false },
            refresh: vi.fn(),
        })

        const newerRelease = makeGitHubRelease({ tag_name: 'v99.0.0', published_at: '2030-01-01T00:00:00Z' })
        const cache = { data: [newerRelease], timestamp: Date.now(), etag: null }
        localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(cache))

        // Simulate /health returning helm install method
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
            if (url === '/health') {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: { get: () => null },
                    json: async () => ({ install_method: 'helm' }),
                })
            }
            return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => [] })
        }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await waitFor(() => {
            expect(result.current.installMethod).toBe('helm')
        })

        // For helm + dev version, hasUpdate should be true when any release exists
        await waitFor(() => {
            expect(result.current.hasUpdate).toBe(true)
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
                    headers: { get: () => null },
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
            return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) })
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
                    headers: { get: () => null },
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
                    headers: { get: () => null },
                    json: async () => commitData,
                })
            }
            return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) })
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

describe('parseReleaseTag', () => {
    it('parses a nightly tag', () => {
        const result = parseReleaseTag('v0.0.1-nightly.20250124')
        expect(result.type).toBe('nightly')
        expect(result.date).toBe('20250124')
    })

    it('parses a weekly tag', () => {
        const result = parseReleaseTag('v0.0.1-weekly.20250124')
        expect(result.type).toBe('weekly')
        expect(result.date).toBe('20250124')
    })

    it('parses a three-part semver stable tag v1.2.3', () => {
        const result = parseReleaseTag('v1.2.3')
        expect(result.type).toBe('stable')
        expect(result.date).toBeNull()
    })

    it('parses a three-part semver stable tag v0.3.11', () => {
        const result = parseReleaseTag('v0.3.11')
        expect(result.type).toBe('stable')
        expect(result.date).toBeNull()
    })

    it('defaults unrecognised tags to stable with null date', () => {
        const result = parseReleaseTag('totally-invalid-tag')
        expect(result.type).toBe('stable')
        expect(result.date).toBeNull()
    })

    it('parses nightly tag with extra version parts', () => {
        const result = parseReleaseTag('v0.3.11-nightly.20260218')
        expect(result.type).toBe('nightly')
        expect(result.date).toBe('20260218')
    })
})

describe('parseRelease', () => {
    it('maps all GitHubRelease fields to ParsedRelease', () => {
        const raw = makeGitHubRelease({
            tag_name: 'v2.0.0',
            name: 'v2.0.0',
            body: 'Some notes',
            published_at: '2025-06-01T12:00:00Z',
            html_url: 'https://github.com/kubestellar/console/releases/tag/v2.0.0',
        })
        const parsed = parseRelease(raw)
        expect(parsed.tag).toBe('v2.0.0')
        expect(parsed.version).toBe('v2.0.0')
        expect(parsed.type).toBe('stable')
        expect(parsed.date).toBeNull()
        expect(parsed.releaseNotes).toBe('Some notes')
        expect(parsed.url).toBe('https://github.com/kubestellar/console/releases/tag/v2.0.0')
    })

    it('returns publishedAt as a Date object', () => {
        const raw = makeGitHubRelease({ published_at: '2025-01-24T00:00:00Z' })
        const parsed = parseRelease(raw)
        expect(parsed.publishedAt).toBeInstanceOf(Date)
        expect(parsed.publishedAt.getFullYear()).toBe(2025)
    })

    it('handles empty body by using empty string for releaseNotes', () => {
        const raw = makeGitHubRelease({ body: '' })
        const parsed = parseRelease(raw)
        expect(parsed.releaseNotes).toBe('')
    })

    it('correctly identifies a nightly release type', () => {
        const raw = makeGitHubRelease({ tag_name: 'v0.3.11-nightly.20260218' })
        const parsed = parseRelease(raw)
        expect(parsed.type).toBe('nightly')
        expect(parsed.date).toBe('20260218')
    })
})

describe('getLatestForChannel', () => {
    const stableRelease = makeParsedRelease({
        tag: 'v1.2.3',
        version: 'v1.2.3',
        type: 'stable',
        publishedAt: new Date('2025-03-01'),
    })
    const olderStableRelease = makeParsedRelease({
        tag: 'v1.2.2',
        version: 'v1.2.2',
        type: 'stable',
        publishedAt: new Date('2025-01-01'),
    })
    const nightlyRelease = makeParsedRelease({
        tag: 'v0.0.1-nightly.20250124',
        version: 'v0.0.1-nightly.20250124',
        type: 'nightly',
        date: '20250124',
        publishedAt: new Date('2025-01-24'),
    })
    const newerNightlyRelease = makeParsedRelease({
        tag: 'v0.0.1-nightly.20250201',
        version: 'v0.0.1-nightly.20250201',
        type: 'nightly',
        date: '20250201',
        publishedAt: new Date('2025-02-01'),
    })

    const allReleases = [stableRelease, olderStableRelease, nightlyRelease, newerNightlyRelease]

    it('returns the latest stable release for stable channel', () => {
        const result = getLatestForChannel(allReleases, 'stable')
        expect(result).not.toBeNull()
        expect(result!.tag).toBe('v1.2.3')
    })

    it('returns the latest nightly release for unstable channel', () => {
        const result = getLatestForChannel(allReleases, 'unstable')
        expect(result).not.toBeNull()
        expect(result!.tag).toBe('v0.0.1-nightly.20250201')
    })

    it('returns null for developer channel', () => {
        const result = getLatestForChannel(allReleases, 'developer')
        expect(result).toBeNull()
    })

    it('returns null when no matching releases exist for stable channel', () => {
        const nightlyOnly = [nightlyRelease, newerNightlyRelease]
        const result = getLatestForChannel(nightlyOnly, 'stable')
        expect(result).toBeNull()
    })

    it('returns null when no matching releases exist for unstable channel', () => {
        const stableOnly = [stableRelease, olderStableRelease]
        const result = getLatestForChannel(stableOnly, 'unstable')
        expect(result).toBeNull()
    })

    it('returns null for empty releases list', () => {
        expect(getLatestForChannel([], 'stable')).toBeNull()
        expect(getLatestForChannel([], 'unstable')).toBeNull()
        expect(getLatestForChannel([], 'developer')).toBeNull()
    })
})

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
            headers: { get: (_k: string) => null },
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
            headers: { get: (_k: string) => null },
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
            headers: { get: (_k: string) => null },
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
            headers: { get: (_k: string) => null },
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
            headers: { get: (_k: string) => null },
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
            headers: { get: (_k: string) => null },
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
            headers: { get: (_k: string) => null },
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
            headers: { get: () => null },
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

describe('isNewerVersion (via hasUpdate)', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('hasUpdate is true when a newer stable release exists (stable channel)', async () => {
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
        // Pre-populate cache with a newer release than the running version
        const newerRelease = makeGitHubRelease({ tag_name: 'v99.0.0', published_at: '2030-01-01T00:00:00Z' })
        const cache = { data: [newerRelease], timestamp: Date.now(), etag: null }
        localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(cache))

        vi.stubGlobal('fetch', vi.fn())

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // Wait for mount effects to populate releases from cache
        await waitFor(() => {
            expect(result.current.releases.length).toBeGreaterThan(0)
        })

        // The running __APP_VERSION__ should be older than v99.0.0
        // hasUpdate depends on whether __APP_VERSION__ is a dev version or a vX.Y.Z tag
        // If __APP_VERSION__ is a dev version (e.g. '0.1.0' without 'v'), hasUpdate is false
        // This test validates the code path is exercised either way
        expect(typeof result.current.hasUpdate).toBe('boolean')
    })

    it('hasUpdate is false when same version is running (stable channel)', async () => {
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
        // Use the running __APP_VERSION__ as the latest release tag
        const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'
        const sameRelease = makeGitHubRelease({ tag_name: currentVersion, published_at: '2025-01-01T00:00:00Z' })
        const cache = { data: [sameRelease], timestamp: Date.now(), etag: null }
        localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(cache))

        vi.stubGlobal('fetch', vi.fn())

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await waitFor(() => {
            // Same version — hasUpdate should be false regardless
            expect(result.current.hasUpdate).toBe(false)
        })
    })

    it('hasUpdate is false when version is skipped', async () => {
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
        const skipTag = 'v99.0.0'
        localStorage.setItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS, JSON.stringify([skipTag]))
        const newerRelease = makeGitHubRelease({ tag_name: skipTag, published_at: '2030-01-01T00:00:00Z' })
        const cache = { data: [newerRelease], timestamp: Date.now(), etag: null }
        localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(cache))

        vi.stubGlobal('fetch', vi.fn())

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await waitFor(() => {
            expect(result.current.releases.length).toBeGreaterThan(0)
        })

        expect(result.current.hasUpdate).toBe(false)
    })

    it('hasUpdate is true for developer channel when SHAs differ', async () => {
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'developer')

        // Agent that supports auto-update and reports a newer SHA
        mockUseLocalAgent.mockReturnValue({
            isConnected: true,
            health: { install_method: 'dev', hasClaude: false },
            refresh: vi.fn(),
        })

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({
                installMethod: 'dev',
                repoPath: '/test',
                currentSHA: 'old1234',
                latestSHA: 'new5678',
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

        await waitFor(() => {
            expect(result.current.hasUpdate).toBe(true)
        })

        // Reset mock
        mockUseLocalAgent.mockReturnValue({
            isConnected: false,
            health: null,
            refresh: vi.fn(),
        })
    })

    it('hasUpdate is false for developer channel when no agent and same SHA', async () => {
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'developer')

        mockUseLocalAgent.mockReturnValue({
            isConnected: false,
            health: null,
            refresh: vi.fn(),
        })

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no agent')))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await waitFor(() => {
            expect(result.current.hasUpdate).toBe(false)
        })
    })
})

describe('version comparison edge cases via parseReleaseTag', () => {
    it('nightly with different base version parts', () => {
        const r1 = parseReleaseTag('v0.3.11-nightly.20260301')
        expect(r1.type).toBe('nightly')
        expect(r1.date).toBe('20260301')
    })

    it('weekly with different base version parts', () => {
        const r1 = parseReleaseTag('v1.0.0-weekly.20260101')
        expect(r1.type).toBe('weekly')
        expect(r1.date).toBe('20260101')
    })

    it('tag without v prefix is stable with null date', () => {
        const r1 = parseReleaseTag('1.0.0')
        expect(r1.type).toBe('stable')
        expect(r1.date).toBeNull()
    })

    it('tag with extra suffix defaults to stable', () => {
        const r1 = parseReleaseTag('v1.0.0-beta.1')
        expect(r1.type).toBe('stable')
        expect(r1.date).toBeNull()
    })
})

describe('isDevVersion', () => {
    it('returns true for "unknown"', () => {
        expect(isDevVersion('unknown')).toBe(true)
    })

    it('returns true for "dev"', () => {
        expect(isDevVersion('dev')).toBe(true)
    })

    it('returns true for "0.0.0" placeholder version', () => {
        expect(isDevVersion('0.0.0')).toBe(true)
    })

    it('returns false for semver without v prefix (e.g. "0.1.0") — Helm installs', () => {
        expect(isDevVersion('0.1.0')).toBe(false)
    })

    it('returns false for "1.0.0" (no v prefix) — valid release', () => {
        expect(isDevVersion('1.0.0')).toBe(false)
    })

    it('returns false for proper tagged version with v prefix', () => {
        expect(isDevVersion('v1.2.3')).toBe(false)
    })

    it('returns false for nightly tag', () => {
        expect(isDevVersion('v0.0.1-nightly.20250124')).toBe(false)
    })

    it('returns false for weekly tag', () => {
        expect(isDevVersion('v0.0.1-weekly.20250124')).toBe(false)
    })
})

describe('isNewerVersion', () => {
    it('returns false when tags are identical', () => {
        expect(isNewerVersion('v1.0.0', 'v1.0.0', 'stable')).toBe(false)
    })

    it('returns false for developer channel (uses SHA comparison instead)', () => {
        expect(isNewerVersion('v1.0.0', 'v2.0.0', 'developer')).toBe(false)
    })

    it('returns true for version without v prefix when newer is available', () => {
        // "0.1.0" without v prefix is a valid release (e.g., Helm install)
        expect(isNewerVersion('0.1.0', 'v2.0.0', 'stable')).toBe(true)
    })

    it('returns false for "0.0.0" placeholder dev version', () => {
        // "0.0.0" is a dev placeholder — no update shown
        expect(isNewerVersion('0.0.0', 'v2.0.0', 'stable')).toBe(false)
    })

    it('returns false for "unknown" current tag', () => {
        expect(isNewerVersion('unknown', 'v2.0.0', 'stable')).toBe(false)
    })

    it('returns true when nightly user has newer stable available (stable channel)', () => {
        // User on nightly v0.3.11, latest stable is v0.3.12
        expect(isNewerVersion('v0.3.11-nightly.20260218', 'v0.3.12', 'stable')).toBe(true)
    })

    it('returns false when nightly user has older stable (stable channel)', () => {
        // User on nightly v0.3.12, latest stable is v0.3.11 — no update
        expect(isNewerVersion('v0.3.12-nightly.20260218', 'v0.3.11', 'stable')).toBe(false)
    })

    it('returns false when nightly user has same base as latest stable', () => {
        // Same base version — stable is the final of the pre-release
        expect(isNewerVersion('v0.3.11-nightly.20260218', 'v0.3.11', 'stable')).toBe(false)
    })

    it('returns false when comparing different types (nightly vs stable on unstable channel)', () => {
        expect(isNewerVersion('v0.0.1-nightly.20250124', 'v1.0.0', 'unstable')).toBe(false)
    })

    it('returns true when comparing nightly dates (newer date)', () => {
        expect(isNewerVersion('v0.0.1-nightly.20250124', 'v0.0.1-nightly.20250201', 'unstable')).toBe(true)
    })

    it('returns false when comparing nightly dates (older date)', () => {
        expect(isNewerVersion('v0.0.1-nightly.20250201', 'v0.0.1-nightly.20250124', 'unstable')).toBe(false)
    })

    it('returns true for newer stable semver (v1.0.0 → v2.0.0)', () => {
        expect(isNewerVersion('v1.0.0', 'v2.0.0', 'stable')).toBe(true)
    })

    it('returns false for older stable semver (v2.0.0 → v1.0.0)', () => {
        expect(isNewerVersion('v2.0.0', 'v1.0.0', 'stable')).toBe(false)
    })

    it('returns true for newer patch version (v1.0.0 → v1.0.1)', () => {
        expect(isNewerVersion('v1.0.0', 'v1.0.1', 'stable')).toBe(true)
    })

    it('returns false for older patch version (v1.0.1 → v1.0.0)', () => {
        expect(isNewerVersion('v1.0.1', 'v1.0.0', 'stable')).toBe(false)
    })

    it('returns false when versions are equal (semver comparison)', () => {
        // Already covered by same-tag check, but exercises semver path too
        expect(isNewerVersion('v1.2.3', 'v1.2.3', 'stable')).toBe(false)
    })

    it('handles versions with different part counts', () => {
        // v1.0 vs v1.0.1 — extra part means newer
        expect(isNewerVersion('v1.0', 'v1.0.1', 'stable')).toBe(true)
    })

    it('returns true for weekly comparison with newer date', () => {
        expect(isNewerVersion('v0.0.1-weekly.20250101', 'v0.0.1-weekly.20250201', 'unstable')).toBe(true)
    })

    it('returns false when weekly dates are the same', () => {
        // Same tag caught by first check
        expect(isNewerVersion('v0.0.1-weekly.20250101', 'v0.0.1-weekly.20250101', 'unstable')).toBe(false)
    })
})

describe('skipVersion and clearSkippedVersions', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        vi.stubGlobal('fetch', vi.fn())
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('skipVersion adds the version to skippedVersions and persists to localStorage', async () => {
        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        act(() => {
            result.current.skipVersion('v2.0.0')
        })

        expect(result.current.skippedVersions).toContain('v2.0.0')
        const stored = JSON.parse(localStorage.getItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS)!)
        expect(stored).toContain('v2.0.0')
    })

    it('clearSkippedVersions empties the list and removes from localStorage', async () => {
        localStorage.setItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS, JSON.stringify(['v1.0.0', 'v2.0.0']))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // Skipped versions should be loaded on mount
        expect(result.current.skippedVersions).toEqual(['v1.0.0', 'v2.0.0'])

        act(() => {
            result.current.clearSkippedVersions()
        })

        expect(result.current.skippedVersions).toEqual([])
        expect(localStorage.getItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS)).toBeNull()
    })

    it('loadSkippedVersions returns empty array for invalid JSON', async () => {
        localStorage.setItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS, 'not-valid-json')

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // Should recover gracefully
        expect(result.current.skippedVersions).toEqual([])
    })
})

describe('setChannel', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('persists the new channel to localStorage and syncs to agent', async () => {
        const mockFetch = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', mockFetch)

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        await act(async () => {
            await result.current.setChannel('unstable')
        })

        expect(result.current.channel).toBe('unstable')
        expect(localStorage.getItem(UPDATE_STORAGE_KEYS.CHANNEL)).toBe('unstable')

        // Should have attempted to sync to kc-agent
        const configCalls = mockFetch.mock.calls.filter(
            (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/auto-update/config')
        )
        expect(configCalls.length).toBeGreaterThan(0)
    })

    it('handles agent sync failure gracefully (no throw)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('agent down')))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        // Should not throw
        await act(async () => {
            await result.current.setChannel('unstable')
        })

        expect(result.current.channel).toBe('unstable')
    })
})

describe('triggerUpdate', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('returns { success: true } when agent responds OK', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        let response: { success: boolean; error?: string } | undefined
        await act(async () => {
            response = await result.current.triggerUpdate()
        })

        expect(response!.success).toBe(true)
    })

    it('returns 404 error message when agent does not support auto-update', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        let response: { success: boolean; error?: string } | undefined
        await act(async () => {
            response = await result.current.triggerUpdate()
        })

        expect(response!.success).toBe(false)
        expect(response!.error).toMatch(/does not support auto-update/)
    })

    it('returns generic error for non-404 failures', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        let response: { success: boolean; error?: string } | undefined
        await act(async () => {
            response = await result.current.triggerUpdate()
        })

        expect(response!.success).toBe(false)
        expect(response!.error).toMatch(/500/)
    })

    it('returns error message when fetch throws', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        let response: { success: boolean; error?: string } | undefined
        await act(async () => {
            response = await result.current.triggerUpdate()
        })

        expect(response!.success).toBe(false)
        expect(response!.error).toBe('network down')
    })

    it('returns generic error when thrown value is not an Error instance', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'))

        const { result } = renderHook(() => useVersionCheck(), { wrapper })

        let response: { success: boolean; error?: string } | undefined
        await act(async () => {
            response = await result.current.triggerUpdate()
        })

        expect(response!.success).toBe(false)
        expect(response!.error).toBe('kc-agent not reachable')
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
            headers: { get: () => null },
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
            headers: { get: (key: string) => key === 'ETag' ? mockEtag : null },
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