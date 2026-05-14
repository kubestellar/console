/**
 * WorkflowMatrix — heatmap of workflows × days. Surfaces the "which
 * workflows keep flaking" pattern that was invisible while we only saw
 * one release-failure issue per night.
 *
 * Data: /api/github-pipelines?view=matrix&days={14|30|90}&repo={optional}.
 * Client can pick 14 / 30 / 90 day ranges (server caps at 90 — the retention
 * of the server-side history blob).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useCardLoadingState } from '../CardDataContext'
import { usePipelineMatrix, getPipelineRepos, type Conclusion } from '../../../hooks/useGitHubPipelines'
import { usePipelineFilter } from './PipelineFilterContext'
import { usePipelineData } from './PipelineDataContext'
import { RepoSubtitle } from './RepoSubtitle'
import { EmbedButton } from './EmbedButton'
import { cn } from '../../../lib/cn'

/** Available range options. Must match the server's MATRIX_MAX_DAYS (90) */
const RANGE_OPTIONS = [14, 30, 90] as const

/** Minimum cell width in px — below this the CSS grid will reflow */
const MIN_CELL_PX = 10

/** Sparse-data threshold: workflows below this recent-day-hit count are
 * hidden when the user has selected a range > 14 (reduces noise for
 * long-windowed views) */
const SPARSE_WORKFLOW_MIN_CELLS = 2

/** Extracted user-visible strings. Kept out of inline JSX attributes to
 * satisfy the ui-ux-standard ratchet and make a future i18n pass easy. */
const LABEL_FILTER_REPO = 'Filter by repo'

/** Heatmap cell colors — semantic `bg-muted` for inactive states so they
 *  adapt to both light and dark themes automatically. */
const CELL_CLASS: Record<string, string> = {
  success: 'bg-green-500/70 hover:bg-green-500',
  failure: 'bg-red-500/80 hover:bg-red-500',
  startup_failure: 'bg-red-500/80 hover:bg-red-500',
  timed_out: 'bg-orange-500/80 hover:bg-orange-500',
  cancelled: 'bg-muted/60 hover:bg-muted',
  skipped: 'bg-muted/40 hover:bg-muted/80',
  action_required: 'bg-yellow-500/70 hover:bg-yellow-500',
  neutral: 'bg-muted/50 hover:bg-muted',
  stale: 'bg-muted/40 hover:bg-muted/80',
}

function cellClass(c: Conclusion): string {
  if (!c) return 'bg-muted/30'
  return CELL_CLASS[c] ?? 'bg-muted/30'
}

export function WorkflowMatrix() {
  const { t } = useTranslation()
  const { t: tCards } = useTranslation('cards')
  const [days, setDays] = useState<number>(RANGE_OPTIONS[0])
  // Shared dashboard filter (if inside PipelineFilterProvider on /ci-cd).
  // Falls back to per-card local state when on a different dashboard.
  const shared = usePipelineFilter()
  const [localRepoFilter, setLocalRepoFilter] = useState<string | null>(null)
  const repoFilter = shared?.repoFilter ?? localRepoFilter
  const setRepoFilter = shared?.setRepoFilter ?? setLocalRepoFilter
  const repos = shared?.repos ?? getPipelineRepos()

  // Prefer shared unified data; fall back to individual fetch when standalone.
  const unifiedData = usePipelineData()
  const hasUnified = !!unifiedData
  const individual = usePipelineMatrix(repoFilter, days, !hasUnified)

  const data = hasUnified ? unifiedData.matrix : individual.data
  const isLoading = hasUnified ? unifiedData.isLoading : individual.isLoading
  const isRefreshing = hasUnified ? unifiedData.isRefreshing : individual.isRefreshing
  const error = hasUnified ? unifiedData.error : individual.error
  const { isDemoMode } = useDemoMode()
  const hasData = (data?.workflows?.length ?? 0) > 0
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: isDemoMode })

  const workflows = (data?.workflows ?? []).filter((wf) => {
    if (days <= RANGE_OPTIONS[0]) return true
    const populated = (wf.cells ?? []).filter((c) => c.conclusion !== null).length
    return populated >= SPARSE_WORKFLOW_MIN_CELLS
  })

  if (error && !hasData) {
    return (
      <div className="p-4 h-full flex items-center justify-center text-sm text-red-400">
        {tCards('pipelines.failedToLoadMatrix')} {error}
      </div>
    )
  }

  return (
    <div className="p-3 h-full flex flex-col gap-2 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="flex items-center gap-2">
          <select
            value={repoFilter ?? ''}
            onChange={(e) => setRepoFilter(e.target.value || null)}
            className="text-xs bg-secondary/40 border border-border rounded px-2 py-1 text-foreground"
            aria-label={LABEL_FILTER_REPO}
          >
            <option value="">{t('pipelines.allRepos')}</option>
            {repos.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 text-xs">
            {RANGE_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDays(n)}
                className={cn(
                  'px-2 py-1 rounded border border-border transition-colors',
                  days === n ? 'bg-primary/20 text-primary border-primary/40' : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/50',
                )}
              >
                {n}d
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {repoFilter && <RepoSubtitle repo={repoFilter} />}
          <span>{workflows.length} workflows</span>
          <EmbedButton
            cardType="workflow-matrix"
            cardTitle="Workflow Matrix"
            currentRepo={repoFilter}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {workflows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No workflow activity in this range.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {workflows.map((wf) => (
              <div key={`${wf.repo}:${wf.name}`} className="flex items-center gap-2">
                <div className="w-48 shrink-0 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate" title={wf.name}>{wf.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{wf.repo}</div>
                </div>
                <div
                  className="flex-1 grid gap-0.5"
                  style={{ gridTemplateColumns: `repeat(${wf.cells.length}, minmax(${MIN_CELL_PX}px, 1fr))` }}
                >
                  {/* Newest-first: server sends oldest→newest, reverse for display */}
                  {[...wf.cells].reverse().map((cell) => {
                    const label = `${cell.date}: ${cell.conclusion ?? 'no run'}`
                    const common = 'h-5 rounded-[2px] transition-colors'
                    return cell.htmlUrl && cell.htmlUrl !== '#' ? (
                      <a
                        key={cell.date}
                        href={cell.htmlUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={label}
                        aria-label={label}
                        className={cn(common, cellClass(cell.conclusion))}
                      />
                    ) : (
                      <div
                        key={cell.date}
                        title={label}
                        aria-label={label}
                        className={cn(common, cellClass(cell.conclusion))}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <Legend className="bg-green-500/70" label="success" />
          <Legend className="bg-red-500/80" label="failure" />
          <Legend className="bg-orange-500/80" label="timed out" />
          <Legend className="bg-muted/60" label="cancelled" />
          <Legend className="bg-muted/30" label="no run" />
        </div>
        {data?.range?.[0] && data?.range?.[data.range.length - 1] && (
          <span className="flex items-center gap-1">
            {data.range[data.range.length - 1]} → {data.range[0]}
            <ExternalLink className="w-3 h-3 opacity-60" />
          </span>
        )}
      </div>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('w-3 h-3 rounded-sm', className)} />
      {label}
    </span>
  )
}
