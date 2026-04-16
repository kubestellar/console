/**
 * PipelineFilterContext — dashboard-level shared filter state for the
 * GitHub Pipelines cards. When the /ci-cd dashboard wraps its cards in
 * <PipelineFilterProvider>, every pipeline card reads the shared repo
 * selection instead of managing its own.
 *
 * Cards that are dragged to OTHER dashboards (where this provider is
 * absent) fall back to their own per-card state — the hook returns
 * `null` and the card renders its own <select>.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { getPipelineRepos } from '../../../hooks/useGitHubPipelines'

interface PipelineFilterState {
  /** null = "All repos", string = single repo filter */
  repoFilter: string | null
  setRepoFilter: (repo: string | null) => void
  /** The repo list (read from the server on first fetch, then cached) */
  repos: string[]
}

const PipelineFilterCtx = createContext<PipelineFilterState | null>(null)

/**
 * Wrap the /ci-cd dashboard in this provider to give all pipeline cards
 * a shared repo filter. Cards call `usePipelineFilter()` to read it.
 */
export function PipelineFilterProvider({ children }: { children: ReactNode }) {
  const [repoFilter, setRepoFilter] = useState<string | null>(null)

  const value: PipelineFilterState = {
    repoFilter,
    setRepoFilter: useCallback((repo: string | null) => setRepoFilter(repo), []),
    repos: getPipelineRepos(),
  }

  return (
    <PipelineFilterCtx.Provider value={value}>
      {children}
    </PipelineFilterCtx.Provider>
  )
}

/**
 * Returns the shared filter state if inside a PipelineFilterProvider,
 * or null if the card is on a different dashboard. Cards should check:
 *
 *   const shared = usePipelineFilter()
 *   const repoFilter = shared?.repoFilter ?? localRepoFilter
 */
export function usePipelineFilter(): PipelineFilterState | null {
  return useContext(PipelineFilterCtx)
}
