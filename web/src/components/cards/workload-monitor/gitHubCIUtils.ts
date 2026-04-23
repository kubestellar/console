import { formatTimeAgo } from '../../../lib/formatters'

export { formatTimeAgo }

export const REPOS_STORAGE_KEY = 'github_ci_repos'
export const DEFAULT_REPOS = ['kubestellar/kubestellar', 'kubestellar/console']

/** Loads the configured repo list from localStorage, falling back to DEFAULT_REPOS. */
export function loadRepos(): string[] {
  if (typeof window === 'undefined') return DEFAULT_REPOS
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
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(REPOS_STORAGE_KEY, JSON.stringify(repos))
  } catch {
    // Silently ignore storage errors (e.g. private browsing, quota exceeded)
  }
}
