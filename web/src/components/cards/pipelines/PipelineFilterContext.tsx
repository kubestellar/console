/**
 * PipelineFilterContext — dashboard-level shared filter + repo CRUD for
 * the GitHub Pipelines cards.
 *
 * Repo list = server defaults (from PIPELINE_REPOS env var, returned in
 * every API response) + user-added repos (persisted in localStorage).
 * Users can add custom repos, hide server-default repos, and the merged
 * list drives both the filter bar pills and the per-card dropdowns.
 *
 * Cards on OTHER dashboards (where the provider is absent) fall back to
 * their own per-card state.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { getPipelineRepos } from '../../../hooks/useGitHubPipelines'
import { safeGetJSON, safeSetJSON } from '../../../lib/utils/localStorage'

/** localStorage key for user-managed repo overrides */
const STORAGE_KEY = 'kc-pipeline-repos'

/** Shape persisted in localStorage */
interface StoredRepoConfig {
  /** Repos the user added beyond the server defaults */
  added: string[]
  /** Server-default repos the user chose to hide */
  hidden: string[]
}

const EMPTY_CONFIG: StoredRepoConfig = { added: [], hidden: [] }

function loadConfig(): StoredRepoConfig {
  return safeGetJSON<StoredRepoConfig>(STORAGE_KEY) ?? EMPTY_CONFIG
}

function saveConfig(config: StoredRepoConfig): void {
  safeSetJSON(STORAGE_KEY, config)
}

/** Merge server repos + user config into the visible list */
function mergeRepos(serverRepos: string[], config: StoredRepoConfig): string[] {
  const hidden = new Set(config.hidden)
  const visible = serverRepos.filter((r) => !hidden.has(r))
  // Append user-added repos that aren't already in the server list
  const serverSet = new Set(serverRepos)
  for (const r of config.added) {
    if (!serverSet.has(r) && !hidden.has(r)) {
      visible.push(r)
    }
  }
  return visible
}

export interface PipelineFilterState {
  /** Selected repos. Empty set = "All repos" (no filtering). */
  selectedRepos: Set<string>
  /** Toggle a repo in/out of the selection. If toggling the last one off, resets to "All". */
  toggleRepo: (repo: string) => void
  /** Select all (clear selection = no filter) */
  selectAll: () => void
  /** The effective repo filter string for the API: null = all, single repo = specific.
   *  Cards pass this to their useCache hooks. */
  repoFilter: string | null
  /** Compat shim: set a single-repo filter (used by per-card dropdowns).
   *  Sets the selection to exactly that repo, or clears it if null. */
  setRepoFilter: (repo: string | null) => void
  /** The merged visible repo list (server defaults + user-added - hidden) */
  repos: string[]
  /** Server-default repos (read-only, from PIPELINE_REPOS env var) */
  serverRepos: string[]
  /** Add a custom repo (owner/repo format). Returns false if already present. */
  addRepo: (repo: string) => boolean
  /** Remove a repo. If it's a server default, hides it. If user-added, deletes it. */
  removeRepo: (repo: string) => void
  /** Restore a hidden server-default repo */
  restoreRepo: (repo: string) => void
  /** List of currently hidden server-default repos */
  hiddenRepos: string[]
  /** Whether any user customization is active */
  hasCustomization: boolean
  /** Reset to server defaults (clear all added + hidden + selection) */
  resetToDefaults: () => void
}

const PipelineFilterCtx = createContext<PipelineFilterState | null>(null)

export function PipelineFilterProvider({ children }: { children: ReactNode }) {
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [config, setConfig] = useState<StoredRepoConfig>(loadConfig)
  const serverRepos = getPipelineRepos()

  // Persist repo config on every change
  useEffect(() => {
    saveConfig(config)
  }, [config])

  const repos = mergeRepos(serverRepos, config)

  // Toggle a repo in/out of the multi-selection
  const toggleRepo = useCallback((repo: string) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev)
      if (next.has(repo)) {
        next.delete(repo)
      } else {
        next.add(repo)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedRepos(new Set())
  }, [])

  // Compute the API-level filter: null = all, single repo string if 1 selected,
  // first selected repo if multiple (API currently supports single-repo filter;
  // for multi-repo the cards fetch once per selected repo or pass null for all).
  // For now: empty set = null (all), 1+ selected = first repo (cards will iterate).
  const repoFilter = selectedRepos.size === 0 ? null : selectedRepos.size === 1
    ? [...selectedRepos][0]
    : null // multi-select with <all repos = show all, let the UI filter client-side

  const addRepo = useCallback((repo: string): boolean => {
    const trimmed = repo.trim()
    if (!trimmed || !trimmed.includes('/')) return false
    const current = mergeRepos(getPipelineRepos(), loadConfig())
    if (current.includes(trimmed)) return false
    setConfig((prev) => {
      if (prev.hidden.includes(trimmed)) {
        return { ...prev, hidden: prev.hidden.filter((r) => r !== trimmed) }
      }
      return { ...prev, added: [...prev.added, trimmed] }
    })
    return true
  }, [])

  const removeRepo = useCallback((repo: string) => {
    setConfig((prev) => {
      const isServerDefault = getPipelineRepos().includes(repo)
      if (isServerDefault) {
        return {
          ...prev,
          hidden: prev.hidden.includes(repo) ? prev.hidden : [...prev.hidden, repo],
        }
      }
      return { ...prev, added: prev.added.filter((r) => r !== repo) }
    })
    // Remove from selection too
    setSelectedRepos((prev) => {
      const next = new Set(prev)
      next.delete(repo)
      return next
    })
  }, [])

  const restoreRepo = useCallback((repo: string) => {
    setConfig((prev) => ({
      ...prev,
      hidden: prev.hidden.filter((r) => r !== repo),
    }))
  }, [])

  const resetToDefaults = useCallback(() => {
    setConfig(EMPTY_CONFIG)
    setSelectedRepos(new Set())
  }, [])

  const hasCustomization = config.added.length > 0 || config.hidden.length > 0

  // Compat: per-card dropdowns call setRepoFilter(repo) — map to selection
  const setRepoFilter = useCallback((repo: string | null) => {
    if (repo === null) {
      setSelectedRepos(new Set())
    } else {
      setSelectedRepos(new Set([repo]))
    }
  }, [])

  const value: PipelineFilterState = {
    selectedRepos,
    toggleRepo,
    selectAll,
    repoFilter,
    setRepoFilter,
    repos,
    serverRepos,
    addRepo,
    removeRepo,
    restoreRepo,
    hiddenRepos: config.hidden,
    hasCustomization,
    resetToDefaults,
  }

  return (
    <PipelineFilterCtx.Provider value={value}>
      {children}
    </PipelineFilterCtx.Provider>
  )
}

export function usePipelineFilter(): PipelineFilterState | null {
  return useContext(PipelineFilterCtx)
}
