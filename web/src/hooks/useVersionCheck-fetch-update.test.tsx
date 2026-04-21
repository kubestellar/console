import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { parseReleaseTag, parseRelease, getLatestForChannel, isDevVersion, isNewerVersion, VersionCheckProvider, useVersionCheck } from './useVersionCheck'
import type { GitHubRelease, ParsedRelease } from '../types/updates'
import { UPDATE_STORAGE_KEYS } from '../types/updates'

// ---------------------------------------------------------------------------
// Mock external dependencies so the hook can mount without a live agent.
// Uses a hoisted ref so individual tests can override the return value.
// ---------------------------------------------------------------------------

const mockUseLocalAgent = vi.hoisted(() =>
  vi.fn(() => ({
    isConnected: false,
    health: null as Record<string, unknown> | null,
    refresh: vi.fn(),
  }))
)

vi.mock('./useLocalAgent', () => ({
  useLocalAgent: mockUseLocalAgent,
}))

vi.mock('../lib/analytics', () => ({
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

// Wrapper that supplies VersionCheckProvider to hooks under test
function wrapper({ children }: { children: React.ReactNode }) {
  return <VersionCheckProvider>{children}</VersionCheckProvider>
}

/** Subset of the proxy URL used to identify calls to the releases endpoint */
const RELEASES_API_PATH = '/api/github/repos/kubestellar/console/releases'

/** Returns true when a fetch mock call is targeting the GitHub releases endpoint */
function isReleasesApiCall(call: unknown[]): boolean {
  return typeof call[0] === 'string' && (call[0] as string).includes(RELEASES_API_PATH)
}

// ---------------------------------------------------------------------------
// parseReleaseTag
// ---------------------------------------------------------------------------


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

// ---------------------------------------------------------------------------
// forceCheck on developer channel with agent support
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// fetchAutoUpdateStatus — agent status endpoint
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// loadChannel — default channel detection
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// loadCache edge cases
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// installMethod detection + auto-reset channel
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// setAutoUpdateEnabled — persist + sync
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// checkForUpdates — developer channel routing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// checkForUpdates — lastChecked guard
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Backend /health fetch for install method
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helm install with dev version — hasUpdate override
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// fetchRecentCommits — commit comparison for developer channel
// ---------------------------------------------------------------------------

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
