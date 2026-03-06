/**
 * Module-level mission cache — survives dialog open/close and tab switches.
 * Also persisted to localStorage so data is instant on page reload.
 * Cache refreshes only when user clicks refresh or after CACHE_TTL_MS elapses.
 */
import type { MissionExport } from '../../../lib/missions/types'

/** Cache time-to-live: 6 hours */
const MISSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000
/** localStorage key for persisted mission cache */
const MISSION_CACHE_STORAGE_KEY = 'kc-mission-cache'

export interface MissionCache {
  installers: MissionExport[]
  solutions: MissionExport[]
  installersFetching: boolean
  solutionsFetching: boolean
  installersDone: boolean
  solutionsDone: boolean
  listeners: Set<() => void>
  abortController: AbortController | null
  fetchedAt: number
  fetchError: string | null
}

export const missionCache: MissionCache = {
  installers: [],
  solutions: [],
  installersFetching: false,
  solutionsFetching: false,
  installersDone: false,
  solutionsDone: false,
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
    const stored = JSON.parse(raw) as { installers: MissionExport[]; solutions: MissionExport[]; fetchedAt: number }
    if (Date.now() - stored.fetchedAt > MISSION_CACHE_TTL_MS) return false
    missionCache.installers = stored.installers || []
    missionCache.solutions = stored.solutions || []
    missionCache.installersDone = true
    missionCache.solutionsDone = true
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
      solutions: missionCache.solutions,
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

/** Path to the pre-built solutions index (single file, ~400KB) */
const SOLUTIONS_INDEX_PATH = 'solutions/index.json'

/**
 * Index entry shape from solutions/index.json — lightweight metadata
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
  return {
    version: MISSION_FILE_FORMAT_VERSION,
    title: entry.title || '',
    description: entry.description || '',
    type: (entry.type as MissionExport['type']) || 'custom',
    tags: entry.tags || [],
    category: entry.category,
    cncfProject: entry.cncfProjects?.[0],
    missionClass: entry.missionClass === 'install' ? 'install' : 'solution',
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

/**
 * Load all missions from the pre-built index in a single API call.
 * Splits results into installers and solutions, populating both caches at once.
 * Persists to localStorage for instant restore on next page load.
 */
async function fetchAllFromIndex() {
  try {
    // Use direct fetch — /api/missions/file is a public endpoint and should not
    // be gated by the api.get() backend-availability check (which can block when
    // the health check hasn't resolved yet on initial page load).
    const url = `/api/missions/file?path=${encodeURIComponent(SOLUTIONS_INDEX_PATH)}`
    const response = await fetch(url, { signal: AbortSignal.timeout(INDEX_FETCH_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`Index fetch failed: ${response.status}`)
    const parsed = await response.json()
    const missions: IndexEntry[] = parsed?.missions || []

    for (const entry of missions) {
      const mission = indexEntryToMission(entry)
      if (entry.missionClass === 'install') {
        missionCache.installers.push(mission)
      } else {
        missionCache.solutions.push(mission)
      }
    }
    missionCache.fetchedAt = Date.now()
    missionCache.fetchError = null
    persistCacheToStorage()
  } catch (err) {
    console.error('[MissionBrowser] Failed to fetch index:', err)
    missionCache.fetchError = err instanceof Error ? err.message : 'Failed to load missions. Please try again.'
  } finally {
    missionCache.installersDone = true
    missionCache.installersFetching = false
    missionCache.solutionsDone = true
    missionCache.solutionsFetching = false
    notifyCacheListeners()
  }
}

/**
 * Start fetching missions if cache is empty or stale.
 * Skips fetch if localStorage cache was restored and is still fresh.
 */
export function startMissionCacheFetch() {
  // Already loaded from localStorage or a previous fetch — skip
  if (missionCache.installersDone && missionCache.solutionsDone) {
    // Check if cache is stale (older than TTL)
    if (missionCache.fetchedAt > 0 && Date.now() - missionCache.fetchedAt < MISSION_CACHE_TTL_MS) {
      notifyCacheListeners()
      return
    }
    // Cache is stale — clear and refetch
    missionCache.installers = []
    missionCache.solutions = []
    missionCache.installersDone = false
    missionCache.solutionsDone = false
  }
  missionCache.installersFetching = true
  missionCache.solutionsFetching = true
  notifyCacheListeners()
  fetchAllFromIndex()
}

/** Force refresh: clear cache and refetch from index */
export function resetMissionCache() {
  missionCache.installers = []
  missionCache.solutions = []
  missionCache.installersDone = false
  missionCache.solutionsDone = false
  missionCache.installersFetching = false
  missionCache.solutionsFetching = false
  missionCache.fetchedAt = 0
  missionCache.fetchError = null
  try { localStorage.removeItem(MISSION_CACHE_STORAGE_KEY) } catch { /* ok */ }
  notifyCacheListeners()
  startMissionCacheFetch()
}
