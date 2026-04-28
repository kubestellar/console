/**
 * Pure utility functions for version parsing, comparison, and release-cache
 * management.  Extracted from useVersionCheck.tsx to reduce file complexity.
 *
 * None of these functions use React hooks — they are plain TypeScript helpers
 * consumed by `useVersionCheckCore` and its tests.
 */

import type {
  UpdateChannel,
  ReleaseType,
  GitHubRelease,
  ParsedRelease,
  ReleasesCache,
} from '../types/updates'
import { UPDATE_STORAGE_KEYS } from '../types/updates'
import { MS_PER_MINUTE } from '../lib/constants/time'

// ── Constants ───────────────────────────────────────────────────────────────

export const GITHUB_API_URL =
  '/api/github/repos/kubestellar/console/releases'
export const GITHUB_MAIN_SHA_URL =
  '/api/github/repos/kubestellar/console/git/ref/heads/main'
export const CACHE_TTL_MS = 30 * MS_PER_MINUTE // 30 minutes cache
export const MIN_CHECK_INTERVAL_MS = 30 * MS_PER_MINUTE // 30 minutes minimum between checks
export const AUTO_UPDATE_POLL_MS = 60 * 1000 // Poll kc-agent for update status every 60s
export const DEV_SHA_CACHE_KEY = 'kc-dev-latest-sha'

/** Number of consecutive fetch failures before surfacing an error to the UI */
export const ERROR_DISPLAY_THRESHOLD = 2
/** Timeout for the /health fetch during install-method detection (ms) */
export const HEALTH_FETCH_TIMEOUT_MS = 3000
/** Max retries for /health when the backend is still warming up */
export const HEALTH_FETCH_MAX_RETRIES = 2
/** Delay between /health retries (ms) — gives the backend time to finish warmup */
export const HEALTH_FETCH_RETRY_DELAY_MS = 3000
/** Timeout for the POST /auto-update/trigger request (ms) */
export const TRIGGER_UPDATE_TIMEOUT_MS = 30_000
/** Timeout for the POST /auto-update/cancel request (ms) — cancellation should be fast */
export const CANCEL_UPDATE_TIMEOUT_MS = 5_000

// ── JSON helper ─────────────────────────────────────────────────────────────

/**
 * Safely parse a fetch Response as JSON.
 *
 * When the backend proxy is unavailable (e.g. on Netlify where /api/github/*
 * has no matching function), the SPA catch-all returns the index.html page.
 * Calling `response.json()` on that HTML body throws:
 *   SyntaxError: JSON.parse: expected double-quoted property name
 * which surfaces as "Error checking updates" (#4555).
 *
 * This helper checks the Content-Type before parsing and throws a descriptive
 * error when the body is not JSON, so callers get a useful message instead of
 * an opaque SyntaxError.
 */
export async function safeJsonParse<T>(response: Response, label: string): Promise<T> {
  const contentType = response.headers.get('Content-Type') || ''
  if (!contentType.includes('application/json') && !contentType.includes('application/vnd.github')) {
    throw new Error(
      `${label}: expected JSON response but received ${contentType || 'unknown content type'} (status ${response.status})`
    )
  }
  try {
    return (await response.json()) as T
  } catch (err) {
    // Guard against malformed JSON even when Content-Type looks correct
    throw new Error(
      `${label}: failed to parse response as JSON — ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

// ── Release parsing ─────────────────────────────────────────────────────────

/**
 * Parse a release tag to determine its type and extract date.
 *
 * Tag patterns:
 * - v0.0.1-nightly.20250124 -> { type: 'nightly', date: '20250124' }
 * - v0.0.1-weekly.20250124 -> { type: 'weekly', date: '20250124' }
 * - v1.2.3 -> { type: 'stable', date: null }
 */
export function parseReleaseTag(tag: string): { type: ReleaseType; date: string | null } {
  const nightlyMatch = tag.match(/^v[\d.]+.*-nightly\.(\d{8})$/)
  if (nightlyMatch) {
    return { type: 'nightly', date: nightlyMatch[1] }
  }

  const weeklyMatch = tag.match(/^v[\d.]+.*-weekly\.(\d{8})$/)
  if (weeklyMatch) {
    return { type: 'weekly', date: weeklyMatch[1] }
  }

  // Semantic version without suffix is considered stable
  if (/^v\d+\.\d+\.\d+$/.test(tag)) {
    return { type: 'stable', date: null }
  }

  // Default to stable for other patterns
  return { type: 'stable', date: null }
}

/**
 * Parse a GitHub release into our normalized format.
 */
export function parseRelease(release: GitHubRelease): ParsedRelease {
  const { type, date } = parseReleaseTag(release.tag_name)
  return {
    tag: release.tag_name,
    version: release.tag_name,
    type,
    date,
    publishedAt: new Date(release.published_at),
    releaseNotes: release.body || '',
    url: release.html_url }
}

/**
 * Get the latest release for a given channel.
 *
 * - stable channel: stable (full semver) releases like v0.3.11
 * - unstable channel: nightly releases
 * - developer channel: returns null (uses SHA-based tracking instead)
 */
export function getLatestForChannel(
  releases: ParsedRelease[],
  channel: UpdateChannel
): ParsedRelease | null {
  if (channel === 'developer') return null

  const targetType: ReleaseType = channel === 'stable' ? 'stable' : 'nightly'

  const filtered = releases
    .filter((r) => r.type === targetType)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())

  return filtered[0] || null
}

/**
 * Check if a version string is a development version.
 * Development versions are simple semver without nightly/weekly suffix.
 */
export function isDevVersion(version: string): boolean {
  // Sentinel values used when no real version is set
  if (version === 'unknown' || version === 'dev') return true
  // Versions like "0.0.0" are placeholder dev builds (unset VITE_APP_VERSION)
  if (version === '0.0.0') return true
  // A version matching semver (with or without 'v' prefix) is a real release.
  // Helm installs report versions without the 'v' prefix (e.g., "0.3.21")
  // which should NOT be treated as dev builds. Two-part versions like "v1.0"
  // are also valid release tags (#9506).
  if (/^v?\d+\.\d+(\.\d+)?/.test(version)) return false
  return true
}

/**
 * Compare two version tags to determine if an update is available.
 * Returns true if latestTag is newer than currentTag.
 *
 * For developer channel, comparison is done via SHA (not here — see autoUpdateStatus).
 * For release channels, compares tag dates or semver parts.
 */
export function isNewerVersion(currentTag: string, latestTag: string, channel: UpdateChannel): boolean {
  if (currentTag === latestTag) return false

  // Developer channel uses SHA comparison, not tag comparison
  if (channel === 'developer') return false

  // Don't show updates for development versions (unless on developer channel)
  if (isDevVersion(currentTag)) return false

  // Extract dates from tags for nightly/weekly comparison
  const currentParsed = parseReleaseTag(currentTag)
  const latestParsed = parseReleaseTag(latestTag)

  // Stable channel: if user is on a nightly/weekly pre-release and a newer stable exists, show update
  // e.g., current = v0.3.11-nightly.20260218, latest = v0.3.12 → update available
  if (channel === 'stable' && latestParsed.type === 'stable' && currentParsed.type !== 'stable') {
    // Extract base version from current (e.g., "0.3.11" from "v0.3.11-nightly.20260218")
    const currentBase = currentTag.replace(/^v/, '').split('-')[0]
    const latestBase = latestTag.replace(/^v/, '')
    const currentParts = currentBase.split('.').map(Number)
    const latestParts = latestBase.split('.').map(Number)
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const c = currentParts[i] || 0
      const l = latestParts[i] || 0
      if (l > c) return true
      if (l < c) return false
    }
    // Same base version — stable release is the final version of the pre-release
    return false
  }

  // Only compare same types (nightly vs nightly, weekly vs weekly)
  if (currentParsed.type !== latestParsed.type) return false

  // If both have dates, compare them
  if (currentParsed.date && latestParsed.date) {
    return latestParsed.date > currentParsed.date
  }

  // For semantic versions, do a simple comparison
  const currentParts = currentTag.replace(/^v/, '').split(/[.-]/)
  const latestParts = latestTag.replace(/^v/, '').split(/[.-]/)

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const current = currentParts[i] || '0'
    const latest = latestParts[i] || '0'

    // Try numeric comparison first
    const currentNum = parseInt(current, 10)
    const latestNum = parseInt(latest, 10)

    if (!isNaN(currentNum) && !isNaN(latestNum)) {
      if (latestNum > currentNum) return true
      if (latestNum < currentNum) return false
    } else {
      // String comparison
      if (latest > current) return true
      if (latest < current) return false
    }
  }

  return false
}

// ── localStorage cache helpers ──────────────────────────────────────────────

/**
 * Load cached releases from localStorage.
 */
export function loadCache(): ReleasesCache | null {
  try {
    const cached = localStorage.getItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE)
    if (!cached) return null

    const parsed = JSON.parse(cached) as ReleasesCache
    return parsed
  } catch {
    return null
  }
}

/**
 * Save releases to localStorage cache.
 */
export function saveCache(data: GitHubRelease[], etag: string | null): void {
  const cache: ReleasesCache = {
    data,
    timestamp: Date.now(),
    etag }
  localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(cache))
}

/**
 * Check if cache is still valid based on TTL.
 */
export function isCacheValid(cache: ReleasesCache): boolean {
  return Date.now() - cache.timestamp < CACHE_TTL_MS
}

/**
 * Load channel preference from localStorage.
 * Defaults to 'developer' for localhost (dev installs), 'stable' otherwise.
 */
export function loadChannel(): UpdateChannel {
  const stored = localStorage.getItem(UPDATE_STORAGE_KEYS.CHANNEL)
  if (stored === 'stable' || stored === 'unstable' || stored === 'developer') {
    return stored
  }
  // Dev installs (localhost) default to developer channel so they get notified of new main commits
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'developer'
  }
  return 'stable'
}

/**
 * Load auto-update enabled preference from localStorage.
 */
export function loadAutoUpdateEnabled(): boolean {
  return localStorage.getItem(UPDATE_STORAGE_KEYS.AUTO_UPDATE_ENABLED) === 'true'
}

/**
 * Load skipped versions from localStorage.
 */
export function loadSkippedVersions(): string[] {
  try {
    const stored = localStorage.getItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS)
    if (!stored) return []
    return JSON.parse(stored) as string[]
  } catch {
    return []
  }
}
