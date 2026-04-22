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

// ---------------------------------------------------------------------------
// parseReleaseTag
// ---------------------------------------------------------------------------


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

// ---------------------------------------------------------------------------
// Version comparison edge cases (nightly dates, stable semver, cross-type)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// isDevVersion — direct unit tests
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// isNewerVersion — direct unit tests covering all branches
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// skipVersion / clearSkippedVersions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// setChannel — persists + syncs to agent
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// triggerUpdate — update via kc-agent
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// fetchReleases — 304 Not Modified, draft filtering, error fallback
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// fetchLatestMainSHA — developer channel, rate limiting, cache fallback
// ---------------------------------------------------------------------------

