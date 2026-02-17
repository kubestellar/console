import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  UpdateChannel,
  ReleaseType,
  GitHubRelease,
  ParsedRelease,
  ReleasesCache,
} from '../types/updates'
import { UPDATE_STORAGE_KEYS } from '../types/updates'
import { STORAGE_KEY_GITHUB_TOKEN } from '../lib/constants'

declare const __APP_VERSION__: string
declare const __COMMIT_HASH__: string

const GITHUB_API_URL =
  'https://api.github.com/repos/kubestellar/console/releases'
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes cache
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes minimum between checks

/**
 * Parse a release tag to determine its type and extract date.
 *
 * Tag patterns:
 * - v0.0.1-nightly.20250124 -> { type: 'nightly', date: '20250124' }
 * - v0.0.1-weekly.20250124 -> { type: 'weekly', date: '20250124' }
 * - v1.2.3 -> { type: 'stable', date: null }
 */
function parseReleaseTag(tag: string): { type: ReleaseType; date: string | null } {
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
function parseRelease(release: GitHubRelease): ParsedRelease {
  const { type, date } = parseReleaseTag(release.tag_name)
  return {
    tag: release.tag_name,
    version: release.tag_name,
    type,
    date,
    publishedAt: new Date(release.published_at),
    releaseNotes: release.body || '',
    url: release.html_url,
  }
}

/**
 * Get the latest release for a given channel.
 *
 * - stable channel: weekly releases
 * - unstable channel: nightly releases
 */
function getLatestForChannel(
  releases: ParsedRelease[],
  channel: UpdateChannel
): ParsedRelease | null {
  const targetType: ReleaseType = channel === 'stable' ? 'weekly' : 'nightly'

  const filtered = releases
    .filter((r) => r.type === targetType)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())

  return filtered[0] || null
}

/**
 * Check if a version string is a development version.
 * Development versions are simple semver without nightly/weekly suffix.
 */
function isDevVersion(version: string): boolean {
  // Dev versions: 0.1.0, 1.0.0, unknown, dev
  if (version === 'unknown' || version === 'dev') return true
  // Simple semver without suffix (no nightly/weekly)
  const parsed = parseReleaseTag(version)
  // If it parsed as 'stable' type but doesn't start with 'v' or has no date, it's dev
  if (parsed.type === 'stable' && !version.startsWith('v')) return true
  return false
}

/**
 * Compare two version tags to determine if an update is available.
 * Returns true if latestTag is newer than currentTag.
 *
 * Note: If currentTag is a development version (no nightly/weekly suffix),
 * we always return false to avoid false positives during local development.
 */
function isNewerVersion(currentTag: string, latestTag: string): boolean {
  if (currentTag === latestTag) return false

  // Don't show updates for development versions
  if (isDevVersion(currentTag)) return false

  // Extract dates from tags for nightly/weekly comparison
  const currentParsed = parseReleaseTag(currentTag)
  const latestParsed = parseReleaseTag(latestTag)

  // Only compare same types (nightly vs nightly, weekly vs weekly)
  if (currentParsed.type !== latestParsed.type) return false

  // If both have dates, compare them
  if (currentParsed.date && latestParsed.date) {
    return latestParsed.date > currentParsed.date
  }

  // For semantic versions, do a simple comparison
  // This is a basic comparison that handles most cases
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

/**
 * Load cached releases from localStorage.
 */
function loadCache(): ReleasesCache | null {
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
function saveCache(data: GitHubRelease[], etag: string | null): void {
  const cache: ReleasesCache = {
    data,
    timestamp: Date.now(),
    etag,
  }
  localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(cache))
}

/**
 * Check if cache is still valid based on TTL.
 */
function isCacheValid(cache: ReleasesCache): boolean {
  return Date.now() - cache.timestamp < CACHE_TTL_MS
}

/**
 * Load channel preference from localStorage.
 */
function loadChannel(): UpdateChannel {
  const stored = localStorage.getItem(UPDATE_STORAGE_KEYS.CHANNEL)
  if (stored === 'stable' || stored === 'unstable') {
    return stored
  }
  return 'stable' // Default to stable
}

/**
 * Load skipped versions from localStorage.
 */
function loadSkippedVersions(): string[] {
  try {
    const stored = localStorage.getItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS)
    if (!stored) return []
    return JSON.parse(stored) as string[]
  } catch {
    return []
  }
}

/**
 * Hook for checking version updates from GitHub releases.
 *
 * Features:
 * - Uses 30-minute cache to minimize API calls
 * - Only auto-fetches when cache is stale (>30 minutes)
 * - User can manually refresh via forceCheck for immediate updates
 * - Supports stable (weekly) and unstable (nightly) channels
 * - Handles rate limiting with ETag conditional requests
 * - Allows skipping specific versions
 */
export function useVersionCheck() {
  const [channel, setChannelState] = useState<UpdateChannel>(loadChannel)
  const [releases, setReleases] = useState<ParsedRelease[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<number | null>(() => {
    const stored = localStorage.getItem(UPDATE_STORAGE_KEYS.LAST_CHECK)
    return stored ? parseInt(stored, 10) : null
  })
  const [skippedVersions, setSkippedVersions] = useState<string[]>(loadSkippedVersions)

  const currentVersion = useMemo(() => {
    try {
      return __APP_VERSION__ || 'unknown'
    } catch {
      return 'unknown'
    }
  }, [])

  const commitHash = useMemo(() => {
    try {
      return __COMMIT_HASH__ || 'unknown'
    } catch {
      return 'unknown'
    }
  }, [])

  /**
   * Set update channel and persist to localStorage.
   */
  const setChannel = useCallback((newChannel: UpdateChannel) => {
    setChannelState(newChannel)
    localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, newChannel)
  }, [])

  /**
   * Fetch releases from GitHub API with caching.
   */
  const fetchReleases = useCallback(async (force = false): Promise<void> => {
    setIsChecking(true)
    setError(null)

    try {
      // Check cache first
      const cache = loadCache()
      if (!force && cache && isCacheValid(cache)) {
        setReleases(cache.data.map(parseRelease))
        setIsChecking(false)
        return
      }

      // Prepare headers for conditional request
      const headers: HeadersInit = {
        Accept: 'application/vnd.github.v3+json',
      }
      if (cache?.etag) {
        headers['If-None-Match'] = cache.etag
      }

      // Use GitHub token if available (base64 encoded in localStorage)
      const storedToken = localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)
      if (storedToken) {
        try {
          const token = atob(storedToken)
          headers['Authorization'] = `Bearer ${token}`
        } catch {
          // Token not base64 encoded (old format), use as-is
          headers['Authorization'] = `Bearer ${storedToken}`
        }
      }

      const response = await fetch(GITHUB_API_URL, { headers })

      // Handle rate limiting
      if (response.status === 403) {
        const resetTime = response.headers.get('X-RateLimit-Reset')
        if (resetTime) {
          const resetDate = new Date(parseInt(resetTime, 10) * 1000)
          throw new Error(`Rate limited. Try again after ${resetDate.toLocaleTimeString()}`)
        }
        throw new Error('Rate limited by GitHub API')
      }

      // Handle 304 Not Modified
      if (response.status === 304 && cache) {
        // Update cache timestamp but keep data
        saveCache(cache.data, cache.etag)
        setReleases(cache.data.map(parseRelease))
        setLastChecked(Date.now())
        localStorage.setItem(UPDATE_STORAGE_KEYS.LAST_CHECK, Date.now().toString())
        setIsChecking(false)
        return
      }

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data = (await response.json()) as GitHubRelease[]
      const etag = response.headers.get('ETag')

      // Filter out drafts
      const validReleases = data.filter((r) => !r.draft)

      // Save to cache
      saveCache(validReleases, etag)

      // Parse and set releases
      setReleases(validReleases.map(parseRelease))
      setLastChecked(Date.now())
      localStorage.setItem(UPDATE_STORAGE_KEYS.LAST_CHECK, Date.now().toString())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check for updates'
      setError(message)

      // Fall back to cache if available
      const cache = loadCache()
      if (cache) {
        setReleases(cache.data.map(parseRelease))
      }
    } finally {
      setIsChecking(false)
    }
  }, [])

  /**
   * Check for updates (respects minimum check interval).
   * Only fetches if cache is stale (older than 30 minutes).
   * User must manually refresh for more frequent updates.
   */
  const checkForUpdates = useCallback(async (): Promise<void> => {
    // Always try to use cached data first
    const cache = loadCache()
    if (cache) {
      setReleases(cache.data.map(parseRelease))

      // Only fetch if cache is older than MIN_CHECK_INTERVAL
      if (Date.now() - cache.timestamp < MIN_CHECK_INTERVAL_MS) {
        return // Cache is fresh, don't fetch
      }
    }

    // Also enforce lastChecked interval as backup
    if (lastChecked && Date.now() - lastChecked < MIN_CHECK_INTERVAL_MS) {
      return
    }

    await fetchReleases()
  }, [lastChecked, fetchReleases])

  /**
   * Force a fresh check, bypassing cache.
   */
  const forceCheck = useCallback(async (): Promise<void> => {
    await fetchReleases(true)
  }, [fetchReleases])

  /**
   * Skip a specific version (won't show update notification for it).
   */
  const skipVersion = useCallback((version: string) => {
    setSkippedVersions((prev) => {
      const updated = [...prev, version]
      localStorage.setItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS, JSON.stringify(updated))
      return updated
    })
  }, [])

  /**
   * Clear all skipped versions.
   */
  const clearSkippedVersions = useCallback(() => {
    setSkippedVersions([])
    localStorage.removeItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS)
  }, [])

  // Compute latest release and update availability
  const latestRelease = useMemo(() => {
    return getLatestForChannel(releases, channel)
  }, [releases, channel])

  const hasUpdate = useMemo(() => {
    if (!latestRelease || currentVersion === 'unknown') return false
    if (skippedVersions.includes(latestRelease.tag)) return false
    return isNewerVersion(currentVersion, latestRelease.tag)
  }, [latestRelease, currentVersion, skippedVersions])

  // Load cached data on mount
  useEffect(() => {
    const cache = loadCache()
    if (cache) {
      setReleases(cache.data.map(parseRelease))
    }
  }, [])

  return {
    // State
    currentVersion,
    commitHash,
    channel,
    latestRelease,
    hasUpdate,
    isChecking,
    error,
    lastChecked,
    skippedVersions,
    releases,

    // Actions
    setChannel,
    checkForUpdates,
    forceCheck,
    skipVersion,
    clearSkippedVersions,
  }
}
