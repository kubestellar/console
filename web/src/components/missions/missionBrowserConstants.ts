/**
 * Constants and small pure helpers used by MissionBrowser.
 *
 * Extracted from MissionBrowser.tsx to keep that component file focused on
 * React rendering logic. These are module-level constants, regexes, and
 * localStorage accessors with no React or DOM-framework dependencies beyond
 * `localStorage`.
 */

export const CATEGORY_FILTERS = [
  'All',
  'Troubleshoot',
  'Deploy',
  'Upgrade',
  'Analyze',
  'Repair',
  'Custom',
] as const

export const SIDEBAR_WIDTH = 280
export const WATCHED_REPOS_KEY = 'kc_mission_watched_repos'
export const WATCHED_PATHS_KEY = 'kc_mission_watched_paths'

/** File extensions accepted by the mission browser */
export const MISSION_FILE_EXTENSIONS = ['.json', '.yaml', '.yml', '.md'] as const
export const MISSION_FILE_ACCEPT = '.json,.yaml,.yml,.md,application/json,text/yaml,text/markdown'

/**
 * #6421 — Matches any filesystem entry whose name begins with a dot.
 * This exhaustively hides ALL dot-prefixed directories and files (the
 * standard Unix hidden-entry convention) from the mission browser UI.
 * The previous implementation only hid an enumerated set (.github, .gitkeep,
 * index.json) which let .gitlab, .assets, .vscode, .well-known, etc. leak
 * through whenever a new one was added to a source repo.
 */
export const HIDDEN_ENTRY_REGEX = /^\./

/**
 * Returns true if an entry should be hidden from the browser listing.
 * Hides dot-prefixed entries (directories AND files) and the legacy
 * `index.json` manifest which is internal routing state, not a mission.
 */
export function isHiddenEntry(name: string): boolean {
  if (HIDDEN_ENTRY_REGEX.test(name)) return true
  if (name === 'index.json') return true
  return false
}

/** Check if a filename has a supported mission file extension */
export function isMissionFile(name: string): boolean {
  const lower = name.toLowerCase()
  return MISSION_FILE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

export const CNCF_CATEGORIES = [
  'All', 'Observability', 'Orchestration', 'Runtime', 'Provisioning',
  'Security', 'Service Mesh', 'App Definition', 'Serverless',
  'Storage', 'Streaming', 'Networking',
] as const

export const MATURITY_LEVELS = ['All', 'graduated', 'incubating', 'sandbox'] as const

export function loadWatchedRepos(): string[] {
  try {
    return JSON.parse(localStorage.getItem(WATCHED_REPOS_KEY) || '[]')
  } catch { return [] }
}

export function saveWatchedRepos(repos: string[]) {
  localStorage.setItem(WATCHED_REPOS_KEY, JSON.stringify(repos))
}

export function loadWatchedPaths(): string[] {
  try {
    return JSON.parse(localStorage.getItem(WATCHED_PATHS_KEY) || '[]')
  } catch { return [] }
}

export function saveWatchedPaths(paths: string[]) {
  localStorage.setItem(WATCHED_PATHS_KEY, JSON.stringify(paths))
}
