/**
 * PipelineFilterBar — dashboard-level repo selector that sits in the
 * DashboardPage's `headerExtra` slot. All pipeline cards on the same
 * dashboard subscribe to the selection via `usePipelineFilter()`.
 */
import { usePipelineFilter } from './PipelineFilterContext'
import { cn } from '../../../lib/cn'

/** Extracted user-visible string — satisfies ui-ux-standard ratchet */
const LABEL_FILTER_REPOS = 'Filter repos'

export function PipelineFilterBar() {
  const ctx = usePipelineFilter()
  if (!ctx) return null

  const { repoFilter, setRepoFilter, repos } = ctx
  const showAll = repos.length > 1

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground font-medium">Repos</span>
      <div className="flex items-center gap-1 flex-wrap">
        {showAll && (
          <button
            type="button"
            onClick={() => setRepoFilter(null)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs border transition-colors',
              repoFilter === null
                ? 'bg-primary/20 text-primary border-primary/40'
                : 'bg-secondary/30 text-muted-foreground border-border hover:bg-secondary/50',
            )}
            aria-label={LABEL_FILTER_REPOS}
          >
            All
          </button>
        )}
        {repos.map((repo) => {
          const short = repo.split('/')[1] ?? repo
          const isSelected = repoFilter === repo
          return (
            <button
              key={repo}
              type="button"
              onClick={() => setRepoFilter(isSelected && showAll ? null : repo)}
              title={repo}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs border transition-colors',
                isSelected
                  ? 'bg-primary/20 text-primary border-primary/40'
                  : 'bg-secondary/30 text-muted-foreground border-border hover:bg-secondary/50',
              )}
            >
              {short}
            </button>
          )
        })}
      </div>
    </div>
  )
}
