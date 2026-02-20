/**
 * Update channel types for the KubeStellar Console.
 *
 * - stable: Weekly releases (recommended for production)
 * - unstable: Nightly releases (latest features, potentially unstable)
 * - developer: Track main branch by commit SHA (dev mode only)
 */
export type UpdateChannel = 'stable' | 'unstable' | 'developer'

/**
 * Release type derived from the version tag pattern.
 *
 * - nightly: v0.0.1-nightly.YYYYMMDD
 * - weekly: v0.0.1-weekly.YYYYMMDD
 * - stable: vX.Y.Z (semantic versioning without suffix)
 */
export type ReleaseType = 'nightly' | 'weekly' | 'stable'

/**
 * How the console was installed — determines update strategy.
 *
 * - dev: Running from source (go.mod present) — git pull + rebuild
 * - binary: Downloaded via start.sh — download new binary + restart
 * - helm: Deployed in-cluster — auto-update disabled
 */
export type InstallMethod = 'dev' | 'binary' | 'helm' | 'unknown'

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
 * Auto-update configuration persisted to kc-agent settings.
 */
export interface AutoUpdateConfig {
  enabled: boolean
  channel: UpdateChannel
}

/**
 * Progress of an in-flight auto-update, broadcast via WebSocket.
 */
export interface UpdateProgress {
  status: 'idle' | 'checking' | 'pulling' | 'building' | 'restarting' | 'done' | 'failed'
  message: string
  progress: number // 0-100
  error?: string
}

/**
 * Status returned by the kc-agent /auto-update/status endpoint.
 */
export interface AutoUpdateStatus {
  installMethod: InstallMethod
  repoPath: string
  currentSHA: string
  latestSHA: string
  hasUpdate: boolean
  hasUncommittedChanges: boolean
  autoUpdateEnabled: boolean
  channel: UpdateChannel
  lastUpdateTime: string | null
  lastUpdateResult: string | null
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
  CHANNEL: 'kc-update-channel',
  RELEASES_CACHE: 'kc-releases-cache',
  SKIPPED_VERSIONS: 'kc-skipped-versions',
  LAST_CHECK: 'kc-version-last-check',
  AUTO_UPDATE_ENABLED: 'kc-auto-update-enabled',
} as const
