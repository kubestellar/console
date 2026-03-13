import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { parseReleaseTag, parseRelease, getLatestForChannel, VersionCheckProvider, useVersionCheck } from './useVersionCheck'
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

// ---------------------------------------------------------------------------
// parseReleaseTag
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// parseRelease
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// getLatestForChannel
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Cache behaviour
// ---------------------------------------------------------------------------

/** Subset of the GitHub API URL used to identify calls to the releases endpoint */
const RELEASES_API_PATH = 'api.github.com/repos/kubestellar/console/releases'

/** Returns true when a fetch mock call is targeting the GitHub releases endpoint */
function isReleasesApiCall(call: unknown[]): boolean {
  return typeof call[0] === 'string' && (call[0] as string).includes(RELEASES_API_PATH)
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

// ---------------------------------------------------------------------------
// VersionCheckProvider — hasUpdate logic
// ---------------------------------------------------------------------------

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
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
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

    await act(async () => {
      await result.current.forceCheck()
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

// ---------------------------------------------------------------------------
// Toggle-sensitive polling (auto-update toggle restarts polling)
// ---------------------------------------------------------------------------

/** URL path used by the hook to fetch auto-update status from kc-agent */
const AUTO_UPDATE_STATUS_PATH = '127.0.0.1:8585/auto-update/status'

/** Returns true when a fetch mock call is targeting the kc-agent auto-update status endpoint */
function isAutoUpdateStatusCall(call: unknown[]): boolean {
  return typeof call[0] === 'string' && (call[0] as string).includes(AUTO_UPDATE_STATUS_PATH)
}

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
})
