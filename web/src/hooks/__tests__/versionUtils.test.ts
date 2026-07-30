import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/constants/time', () => ({
  MS_PER_MINUTE: 60_000,
}))

vi.mock('../../types/updates', () => ({
  UPDATE_STORAGE_KEYS: {
    CHANNEL: 'kc-update-channel',
    RELEASES_CACHE: 'kc-releases-cache',
    SKIPPED_VERSIONS: 'kc-skipped-versions',
    LAST_CHECK: 'kc-version-last-check',
    AUTO_UPDATE_ENABLED: 'kc-auto-update-enabled',
  },
}))

import {
  safeJsonParse,
  parseReleaseTag,
  parseRelease,
  getLatestForChannel,
  isDevVersion,
  isNewerVersion,
  loadCache,
  saveCache,
  isCacheValid,
  loadChannel,
  loadAutoUpdateEnabled,
  loadSkippedVersions,
  CACHE_TTL_MS,
} from '../versionUtils'

import type { GitHubRelease, ParsedRelease } from '../../types/updates'

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// safeJsonParse
// ---------------------------------------------------------------------------

describe('safeJsonParse', () => {
  it('parses valid JSON with application/json content type', async () => {
    const body = { foo: 'bar' }
    const response = new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
    })
    const result = await safeJsonParse<typeof body>(response, 'test')
    expect(result).toEqual(body)
  })

  it('parses valid JSON with application/vnd.github content type', async () => {
    const body = [{ id: 1 }]
    const response = new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/vnd.github.v3+json' },
    })
    const result = await safeJsonParse<typeof body>(response, 'test')
    expect(result).toEqual(body)
  })

  it('throws when content type is HTML (SPA catch-all)', async () => {
    const response = new Response('<html></html>', {
      headers: { 'Content-Type': 'text/html' },
      status: 200,
    })
    await expect(safeJsonParse(response, 'releases')).rejects.toThrow(
      'releases: expected JSON response but received text/html (status 200)'
    )
  })

  it('throws when content type is empty', async () => {
    const response = new Response('not json', {
      headers: {},
      status: 502,
    })
    await expect(safeJsonParse(response, 'proxy')).rejects.toThrow(
      'proxy: expected JSON response but received text/plain;charset=UTF-8 (status 502)'
    )
  })

  it('throws when JSON is malformed despite correct content type', async () => {
    const response = new Response('not valid json {', {
      headers: { 'Content-Type': 'application/json' },
    })
    await expect(safeJsonParse(response, 'data')).rejects.toThrow(
      'data: failed to parse response as JSON'
    )
  })
})

// ---------------------------------------------------------------------------
// parseReleaseTag
// ---------------------------------------------------------------------------

describe('parseReleaseTag', () => {
  it('parses nightly tags', () => {
    expect(parseReleaseTag('v0.0.1-nightly.20250124')).toEqual({ type: 'nightly', date: '20250124' })
  })

  it('parses weekly tags', () => {
    expect(parseReleaseTag('v0.0.1-weekly.20250124')).toEqual({ type: 'weekly', date: '20250124' })
  })

  it('parses stable semver tags', () => {
    expect(parseReleaseTag('v1.2.3')).toEqual({ type: 'stable', date: null })
  })

  it('defaults to stable for unrecognized patterns', () => {
    expect(parseReleaseTag('v1.0.0-beta.1')).toEqual({ type: 'stable', date: null })
  })

  it('handles nightly with complex version prefix', () => {
    expect(parseReleaseTag('v0.3.11-nightly.20260218')).toEqual({ type: 'nightly', date: '20260218' })
  })
})

// ---------------------------------------------------------------------------
// parseRelease
// ---------------------------------------------------------------------------

describe('parseRelease', () => {
  it('converts a GitHub release to ParsedRelease', () => {
    const release: GitHubRelease = {
      tag_name: 'v1.0.0',
      published_at: '2025-01-15T00:00:00Z',
      body: 'Release notes here',
      html_url: 'https://github.com/kubestellar/console/releases/tag/v1.0.0',
      prerelease: false,
    }
    const result = parseRelease(release)
    expect(result.tag).toBe('v1.0.0')
    expect(result.type).toBe('stable')
    expect(result.date).toBeNull()
    expect(result.releaseNotes).toBe('Release notes here')
    expect(result.publishedAt).toBeInstanceOf(Date)
  })

  it('handles empty body', () => {
    const release: GitHubRelease = {
      tag_name: 'v0.0.1-nightly.20250124',
      published_at: '2025-01-24T00:00:00Z',
      body: '',
      html_url: 'https://github.com/example',
      prerelease: true,
    }
    const result = parseRelease(release)
    expect(result.type).toBe('nightly')
    expect(result.date).toBe('20250124')
    expect(result.releaseNotes).toBe('')
  })
})

// ---------------------------------------------------------------------------
// getLatestForChannel
// ---------------------------------------------------------------------------

describe('getLatestForChannel', () => {
  const releases: ParsedRelease[] = [
    { tag: 'v1.0.0', version: 'v1.0.0', type: 'stable', date: null, publishedAt: new Date('2025-01-01'), releaseNotes: '', url: '' },
    { tag: 'v1.1.0', version: 'v1.1.0', type: 'stable', date: null, publishedAt: new Date('2025-02-01'), releaseNotes: '', url: '' },
    { tag: 'v0.0.1-nightly.20250115', version: 'v0.0.1-nightly.20250115', type: 'nightly', date: '20250115', publishedAt: new Date('2025-01-15'), releaseNotes: '', url: '' },
    { tag: 'v0.0.1-nightly.20250120', version: 'v0.0.1-nightly.20250120', type: 'nightly', date: '20250120', publishedAt: new Date('2025-01-20'), releaseNotes: '', url: '' },
  ]

  it('returns latest stable release for stable channel', () => {
    const result = getLatestForChannel(releases, 'stable')
    expect(result?.tag).toBe('v1.1.0')
  })

  it('returns latest nightly for unstable channel', () => {
    const result = getLatestForChannel(releases, 'unstable')
    expect(result?.tag).toBe('v0.0.1-nightly.20250120')
  })

  it('returns null for developer channel', () => {
    expect(getLatestForChannel(releases, 'developer')).toBeNull()
  })

  it('returns null when no releases match the channel', () => {
    const stableOnly: ParsedRelease[] = [
      { tag: 'v1.0.0', version: 'v1.0.0', type: 'stable', date: null, publishedAt: new Date('2025-01-01'), releaseNotes: '', url: '' },
    ]
    expect(getLatestForChannel(stableOnly, 'unstable')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isDevVersion
// ---------------------------------------------------------------------------

describe('isDevVersion', () => {
  it('returns true for "unknown"', () => {
    expect(isDevVersion('unknown')).toBe(true)
  })

  it('returns true for "dev"', () => {
    expect(isDevVersion('dev')).toBe(true)
  })

  it('returns true for "0.0.0"', () => {
    expect(isDevVersion('0.0.0')).toBe(true)
  })

  it('returns false for semver with v prefix', () => {
    expect(isDevVersion('v1.2.3')).toBe(false)
  })

  it('returns false for semver without v prefix (Helm installs)', () => {
    expect(isDevVersion('0.3.21')).toBe(false)
  })

  it('returns false for two-part version tags', () => {
    expect(isDevVersion('v1.0')).toBe(false)
  })

  it('returns true for random string', () => {
    expect(isDevVersion('abc123')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isNewerVersion
// ---------------------------------------------------------------------------

describe('isNewerVersion', () => {
  it('returns false when tags are identical', () => {
    expect(isNewerVersion('v1.0.0', 'v1.0.0', 'stable')).toBe(false)
  })

  it('returns false for developer channel', () => {
    expect(isNewerVersion('v1.0.0', 'v2.0.0', 'developer')).toBe(false)
  })

  it('returns false for dev versions', () => {
    expect(isNewerVersion('dev', 'v2.0.0', 'stable')).toBe(false)
  })

  it('detects newer stable version', () => {
    expect(isNewerVersion('v1.0.0', 'v1.1.0', 'stable')).toBe(true)
  })

  it('returns false when current is newer', () => {
    expect(isNewerVersion('v2.0.0', 'v1.0.0', 'stable')).toBe(false)
  })

  it('detects newer nightly by date', () => {
    expect(isNewerVersion('v0.0.1-nightly.20250101', 'v0.0.1-nightly.20250115', 'unstable')).toBe(true)
  })

  it('returns false for older nightly', () => {
    expect(isNewerVersion('v0.0.1-nightly.20250115', 'v0.0.1-nightly.20250101', 'unstable')).toBe(false)
  })

  it('returns false when comparing different types on unstable channel', () => {
    expect(isNewerVersion('v1.0.0', 'v0.0.1-nightly.20250101', 'unstable')).toBe(false)
  })

  it('shows update from nightly to newer stable on stable channel', () => {
    expect(isNewerVersion('v0.3.11-nightly.20260218', 'v0.3.12', 'stable')).toBe(true)
  })

  it('returns false when nightly base equals stable on stable channel', () => {
    expect(isNewerVersion('v0.3.11-nightly.20260218', 'v0.3.11', 'stable')).toBe(false)
  })

  it('handles patch version comparison', () => {
    expect(isNewerVersion('v1.0.0', 'v1.0.1', 'stable')).toBe(true)
  })

  it('handles major version bump', () => {
    expect(isNewerVersion('v1.9.9', 'v2.0.0', 'stable')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// loadCache / saveCache / isCacheValid
// ---------------------------------------------------------------------------

describe('loadCache', () => {
  it('returns null when nothing is cached', () => {
    expect(loadCache()).toBeNull()
  })

  it('returns parsed cache when valid JSON exists', () => {
    const cache = { data: [], timestamp: Date.now(), etag: 'abc' }
    localStorage.setItem('kc-releases-cache', JSON.stringify(cache))
    const result = loadCache()
    expect(result).toEqual(cache)
  })

  it('returns null on malformed JSON', () => {
    localStorage.setItem('kc-releases-cache', 'not json')
    expect(loadCache()).toBeNull()
  })
})

describe('saveCache', () => {
  it('saves releases to localStorage', () => {
    const data: GitHubRelease[] = [
      { tag_name: 'v1.0.0', published_at: '2025-01-01T00:00:00Z', body: '', html_url: '', prerelease: false },
    ]
    saveCache(data, 'etag-123')
    const stored = localStorage.getItem('kc-releases-cache')
    expect(stored).toBeDefined()
    const parsed = JSON.parse(stored!)
    expect(parsed.data).toEqual(data)
    expect(parsed.etag).toBe('etag-123')
    expect(parsed.timestamp).toBeGreaterThan(0)
  })

  it('handles null etag', () => {
    saveCache([], null)
    const parsed = JSON.parse(localStorage.getItem('kc-releases-cache')!)
    expect(parsed.etag).toBeNull()
  })
})

describe('isCacheValid', () => {
  it('returns true when cache is fresh', () => {
    expect(isCacheValid({ data: [], timestamp: Date.now(), etag: null })).toBe(true)
  })

  it('returns false when cache is expired', () => {
    const expired = Date.now() - CACHE_TTL_MS - 1
    expect(isCacheValid({ data: [], timestamp: expired, etag: null })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// loadChannel
// ---------------------------------------------------------------------------

describe('loadChannel', () => {
  it('returns stored channel when valid', () => {
    localStorage.setItem('kc-update-channel', 'unstable')
    expect(loadChannel()).toBe('unstable')
  })

  it('returns stored "stable" channel', () => {
    localStorage.setItem('kc-update-channel', 'stable')
    expect(loadChannel()).toBe('stable')
  })

  it('returns "developer" for localhost when no stored value', () => {
    expect(loadChannel()).toBe('developer')
  })

  it('ignores invalid stored values and falls back', () => {
    localStorage.setItem('kc-update-channel', 'invalid')
    expect(loadChannel()).toBe('developer')
  })
})

// ---------------------------------------------------------------------------
// loadAutoUpdateEnabled
// ---------------------------------------------------------------------------

describe('loadAutoUpdateEnabled', () => {
  it('returns true when enabled', () => {
    localStorage.setItem('kc-auto-update-enabled', 'true')
    expect(loadAutoUpdateEnabled()).toBe(true)
  })

  it('returns false when not set', () => {
    expect(loadAutoUpdateEnabled()).toBe(false)
  })

  it('returns false for non-"true" values', () => {
    localStorage.setItem('kc-auto-update-enabled', 'false')
    expect(loadAutoUpdateEnabled()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// loadSkippedVersions
// ---------------------------------------------------------------------------

describe('loadSkippedVersions', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadSkippedVersions()).toEqual([])
  })

  it('returns parsed array of versions', () => {
    localStorage.setItem('kc-skipped-versions', JSON.stringify(['v1.0.0', 'v1.1.0']))
    expect(loadSkippedVersions()).toEqual(['v1.0.0', 'v1.1.0'])
  })

  it('returns empty array on malformed JSON', () => {
    localStorage.setItem('kc-skipped-versions', 'bad json')
    expect(loadSkippedVersions()).toEqual([])
  })
})
