/**
 * Module-level mission cache — survives dialog open/close and tab switches.
 * Also persisted to localStorage so data is instant on page reload.
 * Cache refreshes only when user clicks refresh or after CACHE_TTL_MS elapses.
 */
import type { MissionExport, MissionMatch } from '../../../lib/missions/types'
import type { ClusterContext } from '../../../hooks/useClusterContext'
import { MS_PER_HOUR, MS_PER_MINUTE } from '../../../lib/constants/time'

/** Cache time-to-live: 6 hours */
const MISSION_CACHE_TTL_MS = 6 * MS_PER_HOUR
/** Recommendation cache TTL: 10 minutes (shorter since it depends on cluster context) */
const RECOMMENDATION_CACHE_TTL_MS = 10 * MS_PER_MINUTE
/** localStorage key for persisted mission cache */
const MISSION_CACHE_STORAGE_KEY = 'kc-mission-cache'

export interface MissionCache {
  installers: MissionExport[]
  fixes: MissionExport[]
  installersFetching: boolean
  fixesFetching: boolean
  installersDone: boolean
  fixesDone: boolean
  listeners: Set<() => void>
  abortController: AbortController | null
  fetchedAt: number
  fetchError: string | null
}

export const missionCache: MissionCache = {
  installers: [],
  fixes: [],
  installersFetching: false,
  fixesFetching: false,
  installersDone: false,
  fixesDone: false,
  listeners: new Set(),
  abortController: null,
  fetchedAt: 0,
  fetchError: null,
}

/** Try to restore mission cache from localStorage on module load */
function restoreCacheFromStorage() {
  try {
    const raw = localStorage.getItem(MISSION_CACHE_STORAGE_KEY)
    if (!raw) return false
    const stored = JSON.parse(raw) as { installers: MissionExport[]; fixes: MissionExport[]; fetchedAt: number }
    if (Date.now() - stored.fetchedAt > MISSION_CACHE_TTL_MS) return false
    missionCache.installers = stored.installers || []
    missionCache.fixes = stored.fixes || []
    missionCache.installersDone = true
    missionCache.fixesDone = true
    missionCache.fetchedAt = stored.fetchedAt
    return true
  } catch {
    return false
  }
}

/** Persist current mission cache to localStorage */
function persistCacheToStorage() {
  try {
    localStorage.setItem(MISSION_CACHE_STORAGE_KEY, JSON.stringify({
      installers: missionCache.installers,
      fixes: missionCache.fixes,
      fetchedAt: missionCache.fetchedAt,
    }))
  } catch {
    // Storage full or unavailable — non-critical
  }
}

// Restore cache immediately on module load
restoreCacheFromStorage()

export function notifyCacheListeners() {
  missionCache.listeners.forEach(fn => fn())
}

/** Path to the pre-built fixes index (single file, ~400KB) */
const FIXES_INDEX_PATH = 'fixes/index.json'

/**
 * Index entry shape from fixes/index.json — lightweight metadata
 * for browsing without loading full mission files.
 */
interface IndexEntry {
  path: string
  title: string
  description: string
  category?: string
  missionClass?: string
  author?: string
  authorGithub?: string
  authorAvatar?: string
  tags?: string[]
  cncfProjects?: string[]
  targetResourceKinds?: string[]
  difficulty?: string
  issueTypes?: string[]
  type?: string
  installMethods?: string[]
  /** CNCF project version (e.g., "1.4.1") — present for install missions */
  projectVersion?: string
  /** CNCF maturity level: graduated, incubating, or sandbox */
  maturity?: string
  /** Auto-generated quality score (0-100) */
  qualityScore?: number
}

/** File format version used by console-kb mission files */
const MISSION_FILE_FORMAT_VERSION = 'kc-mission-v1'

/** Convert an index entry to a MissionExport (browsing metadata only — steps loaded on demand) */
function indexEntryToMission(entry: IndexEntry): MissionExport {
  // Derive stable name from path: "fixes/cncf-install/install-opa.json" → "install-opa"
  const name = entry.path
    ? entry.path.replace(/^.*\//, '').replace(/\.json$/, '')
    : undefined
  return {
    version: MISSION_FILE_FORMAT_VERSION,
    name,
    title: entry.title || '',
    description: entry.description || '',
    type: (entry.type as MissionExport['type']) || 'custom',
    tags: entry.tags || [],
    category: entry.category,
    cncfProject: entry.cncfProjects?.[0],
    missionClass: entry.missionClass === 'install' ? 'install' : 'fixer',
    difficulty: entry.difficulty,
    installMethods: entry.installMethods,
    author: entry.author,
    authorGithub: entry.authorGithub,
    steps: [], // loaded on demand when user selects a mission
    metadata: {
      source: entry.path,
      projectVersion: entry.projectVersion,
      maturity: entry.maturity,
      qualityScore: entry.qualityScore,
    },
  }
}

/** Timeout for fetching individual mission files (ms) */
export const MISSION_FILE_FETCH_TIMEOUT_MS = 15_000

/**
 * Fetch the full mission file and extract steps.
 *
 * Mission files in console-kb store steps under a nested `mission` object:
 *   { mission: { steps, uninstall, upgrade, troubleshooting, ... }, metadata, ... }
 *
 * This function fetches the file, extracts the nested data, and merges it
 * into the index-based MissionExport so all sections (install, uninstall,
 * upgrade, troubleshooting) are available in the detail view.
 */
export async function fetchMissionContent(
  indexMission: MissionExport,
): Promise<{ mission: MissionExport; raw: string }> {
  const sourcePath = indexMission.metadata?.source
  if (!sourcePath) return { mission: indexMission, raw: JSON.stringify(indexMission, null, 2) }

  const url = `/api/missions/file?path=${encodeURIComponent(sourcePath)}`
  const response = await fetch(url, { signal: AbortSignal.timeout(MISSION_FILE_FETCH_TIMEOUT_MS) })
  if (!response.ok) return { mission: indexMission, raw: JSON.stringify(indexMission, null, 2) }

  const text = await response.text()
  const parsed = JSON.parse(text)

  // Extract steps from the nested `mission` object (console-kb file format)
  // Falls back to top-level fields if the nested structure isn't present
  const nested = parsed.mission || {}
  const fileMeta = parsed.metadata || {}
  const merged: MissionExport = {
    ...indexMission,
    steps: nested.steps || parsed.steps || indexMission.steps,
    uninstall: nested.uninstall || parsed.uninstall,
    upgrade: nested.upgrade || parsed.upgrade,
    troubleshooting: nested.troubleshooting || parsed.troubleshooting,
    resolution: nested.resolution || parsed.resolution,
    prerequisites: parsed.prerequisites || indexMission.prerequisites,
    metadata: {
      ...indexMission.metadata,
      qualityScore: fileMeta.qualityScore,
      maturity: fileMeta.maturity,
      projectVersion: fileMeta.projectVersion,
      sourceUrls: fileMeta.sourceUrls,
    },
  }

  return { mission: merged, raw: text }
}

/** Request timeout for the index fetch in milliseconds */
const INDEX_FETCH_TIMEOUT_MS = 30_000

/** Maximum retry attempts for transient index fetch failures (#10966) */
const INDEX_FETCH_MAX_RETRIES = 2

/** Base delay between retry attempts in milliseconds */
const INDEX_FETCH_RETRY_BASE_DELAY_MS = 500

/**
 * Load all missions from the pre-built index in a single API call.
 * Splits results into installers and fixes, populating both caches at once.
 * Persists to localStorage for instant restore on next page load.
 * Retries transient failures (5xx, network) with exponential backoff (#10966).
 */
async function fetchAllFromIndex() {
  try {
    // Use direct fetch — /api/missions/file is a public endpoint and should not
    // be gated by the api.get() backend-availability check (which can block when
    // the health check hasn't resolved yet on initial page load).
    const url = `/api/missions/file?path=${encodeURIComponent(FIXES_INDEX_PATH)}`

    let response: Response | null = null
    for (let attempt = 0; attempt <= INDEX_FETCH_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, INDEX_FETCH_RETRY_BASE_DELAY_MS * (1 << (attempt - 1))))
      }
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(INDEX_FETCH_TIMEOUT_MS) })
        // Success or client error (4xx) — don't retry
        if (response.ok || response.status < 500) break
        // 5xx — retry if attempts remain
        console.warn(`[MissionBrowser] Index fetch returned ${response.status}, attempt ${attempt + 1}/${INDEX_FETCH_MAX_RETRIES + 1}`)
      } catch (err) {
        // Network error — retry if attempts remain
        if (attempt === INDEX_FETCH_MAX_RETRIES) throw err
        console.warn(`[MissionBrowser] Index fetch network error, attempt ${attempt + 1}/${INDEX_FETCH_MAX_RETRIES + 1}:`, err)
      }
    }

    if (!response || !response.ok) {
      throw new Error(`Index fetch failed: ${response?.status ?? 'no response'}`)
    }
    const parsed = await response.json()
    const missions: IndexEntry[] = parsed?.missions || []

    // Clear arrays before populating to prevent duplicates when refetching
    // after cache expiry while localStorage entries are still present (#5217)
    missionCache.installers = []
    missionCache.fixes = []

    for (const entry of missions) {
      const mission = indexEntryToMission(entry)
      if (entry.missionClass === 'install') {
        missionCache.installers.push(mission)
      } else {
        missionCache.fixes.push(mission)
      }
    }
    missionCache.fetchedAt = Date.now()
    missionCache.fetchError = null
    persistCacheToStorage()
  } catch (err: unknown) {
    console.warn('[MissionBrowser] Failed to fetch index:', err)
    missionCache.fetchError = err instanceof Error ? err.message : 'Failed to load missions. Please try again.'
  } finally {
    missionCache.installersDone = true
    missionCache.installersFetching = false
    missionCache.fixesDone = true
    missionCache.fixesFetching = false
    notifyCacheListeners()
  }
}

/**
 * Start fetching missions if cache is empty or stale.
 * Skips fetch if localStorage cache was restored and is still fresh.
 */
export function startMissionCacheFetch() {
  // Already loaded from localStorage or a previous fetch — skip
  if (missionCache.installersDone && missionCache.fixesDone) {
    // Check if cache is stale (older than TTL)
    if (missionCache.fetchedAt > 0 && Date.now() - missionCache.fetchedAt < MISSION_CACHE_TTL_MS) {
      notifyCacheListeners()
      return
    }
    // Cache is stale — clear and refetch
    missionCache.installers = []
    missionCache.fixes = []
    missionCache.installersDone = false
    missionCache.fixesDone = false
  }
  missionCache.installersFetching = true
  missionCache.fixesFetching = true
  notifyCacheListeners()
  fetchAllFromIndex()
}

/** Force refresh: clear cache and refetch from index */
export function resetMissionCache() {
  missionCache.installers = []
  missionCache.fixes = []
  missionCache.installersDone = false
  missionCache.fixesDone = false
  missionCache.installersFetching = false
  missionCache.fixesFetching = false
  missionCache.fetchedAt = 0
  missionCache.fetchError = null
  // Also invalidate recommendation cache when mission data is refreshed
  resetRecommendationCache()
  try { localStorage.removeItem(MISSION_CACHE_STORAGE_KEY) } catch { /* ok */ }
  notifyCacheListeners()
  startMissionCacheFetch()
}

// ============================================================================
// Recommendation cache — avoids re-running matchMissionsToCluster on every dialog open
// ============================================================================

interface RecommendationCacheEntry {
  /** Cached recommendation results */
  recommendations: MissionMatch[]
  /** Number of fixes when recommendations were computed (invalidation key) */
  fixerCount: number
  /** Timestamp of last computation */
  computedAt: number
  /** Fingerprint of the cluster context used to compute recommendations */
  clusterFingerprint: string
}

/**
 * Generate a stable fingerprint string from a ClusterContext.
 * Used to invalidate the recommendation cache when the user switches clusters
 * or when cluster state changes (new operators, different issues, etc.).
 * Returns a fixed string for null context (no cluster connected).
 */
const NO_CLUSTER_FINGERPRINT = '__no_cluster__'

export function computeClusterFingerprint(ctx: ClusterContext | null): string {
  if (!ctx) return NO_CLUSTER_FINGERPRINT
  // Sort arrays for stability — the order of resources/issues/labels
  // can vary between renders without meaning the cluster actually changed.
  const resources = [...ctx.resources].sort().join(',')
  const issues = [...ctx.issues].sort().join(',')
  const labelEntries = Object.entries(ctx.labels).sort(([a], [b]) => a.localeCompare(b))
  const labels = labelEntries.map(([k, v]) => `${k}=${v}`).join(',')
  return `${ctx.name}|${ctx.provider ?? ''}|${ctx.version ?? ''}|${resources}|${issues}|${labels}`
}

let recommendationCacheEntry: RecommendationCacheEntry | null = null

/**
 * Get cached recommendations if the cache is still valid.
 * Returns null if the cache is stale, empty, the fixer count has changed
 * (indicating new data was fetched), or the cluster context has changed.
 */
export function getCachedRecommendations(clusterCtx: ClusterContext | null): MissionMatch[] | null {
  if (!recommendationCacheEntry) return null
  // Invalidate if fixes changed (new data arrived)
  if (recommendationCacheEntry.fixerCount !== missionCache.fixes.length) return null
  // Invalidate if TTL expired
  if (Date.now() - recommendationCacheEntry.computedAt > RECOMMENDATION_CACHE_TTL_MS) return null
  // Invalidate if cluster context changed (different cluster, new operators, etc.)
  if (recommendationCacheEntry.clusterFingerprint !== computeClusterFingerprint(clusterCtx)) return null
  return recommendationCacheEntry.recommendations
}

/**
 * Store computed recommendations in the module-level cache.
 */
export function setCachedRecommendations(recommendations: MissionMatch[], clusterCtx: ClusterContext | null) {
  recommendationCacheEntry = {
    recommendations,
    fixerCount: missionCache.fixes.length,
    computedAt: Date.now(),
    clusterFingerprint: computeClusterFingerprint(clusterCtx),
  }
}

/** Clear the recommendation cache (used on explicit refresh) */
export function resetRecommendationCache() {
  recommendationCacheEntry = null
}
