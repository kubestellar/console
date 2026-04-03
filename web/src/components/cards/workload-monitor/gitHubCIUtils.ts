export const REPOS_STORAGE_KEY = 'github_ci_repos'
export const DEFAULT_REPOS = ['kubestellar/kubestellar', 'kubestellar/console']

/** Formats an ISO timestamp into a human-readable relative time string (e.g. "5m ago"). */
export function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Loads the configured repo list from localStorage, falling back to DEFAULT_REPOS. */
export function loadRepos(): string[] {
  try {
    const stored = localStorage.getItem(REPOS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_REPOS
}

/** Persists the repo list to localStorage. */
export function saveRepos(repos: string[]) {
  try {
    localStorage.setItem(REPOS_STORAGE_KEY, JSON.stringify(repos))
  } catch {
    // Silently ignore storage errors (e.g. private browsing, quota exceeded)
  }
}
