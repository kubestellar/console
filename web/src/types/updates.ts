/**
 * Update channel types for the KubeStellar Console.
 *
 * - stable: Weekly releases (recommended for production)
 * - unstable: Nightly releases (latest features, potentially unstable)
 */
export type UpdateChannel = 'stable' | 'unstable'

/**
 * Release type derived from the version tag pattern.
 *
 * - nightly: v0.0.1-nightly.YYYYMMDD
 * - weekly: v0.0.1-weekly.YYYYMMDD
 * - stable: vX.Y.Z (semantic versioning without suffix)
 */
export type ReleaseType = 'nightly' | 'weekly' | 'stable'

/**
 * Raw GitHub release data from the API.
 */
export interface GitHubRelease {
  tag_name: string
  name: string
  body: string
  published_at: string
  html_url: string
  prerelease: boolean
  draft: boolean
}

/**
 * Parsed release information with normalized fields.
 */
export interface ParsedRelease {
  tag: string
  version: string
  type: ReleaseType
  date: string | null
  publishedAt: Date
  releaseNotes: string
  url: string
}

/**
 * Cached releases with TTL and ETag for conditional requests.
 */
export interface ReleasesCache {
  data: GitHubRelease[]
  timestamp: number
  etag: string | null
}

/**
 * Complete update state managed by useVersionCheck hook.
 */
export interface UpdateState {
  currentVersion: string
  channel: UpdateChannel
  latestRelease: ParsedRelease | null
  hasUpdate: boolean
  lastChecked: number | null
  skippedVersions: string[]
  isChecking: boolean
  error: string | null
}

/**
 * Storage keys for localStorage persistence.
 */
export const UPDATE_STORAGE_KEYS = {
  CHANNEL: 'ksc-update-channel',
  RELEASES_CACHE: 'ksc-releases-cache',
  SKIPPED_VERSIONS: 'ksc-skipped-versions',
  LAST_CHECK: 'ksc-version-last-check',
} as const
