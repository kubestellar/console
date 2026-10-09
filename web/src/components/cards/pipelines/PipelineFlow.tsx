/**
 * PipelineFlow — Drasi-styled flow visualization of in-progress and
 * recently-queued GitHub Actions runs. Each run is rendered as a
 * horizontal 4-column flow:
 *
 *    Trigger ──► Workflow ──► Jobs ──► Steps
 *
 * SVG paths connect each column; segments that are currently-running get
 * animated flow dots (via <animateMotion>, same technique as Drasi's
 * reactive graph — borrowed from DrasiReactiveGraph.tsx).
 *
 * Data: /api/github-pipelines?view=flow. Client polls every 10s (Drasi's
 * cadence) so the flow looks live without hammering the function.
 */
import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useCardLoadingState } from '../CardDataContext'
import {
  usePipelineFlow,
  usePipelineMutations,
  getPipelineRepos,
} from '../../../hooks/useGitHubPipelines'
import { usePipelineFilter } from './PipelineFilterContext'
import { usePipelineData } from './PipelineDataContext'
import { RepoSubtitle } from './RepoSubtitle'
import { EmbedButton } from './EmbedButton'
import { cn } from '../../../lib/cn'
import { RunRow } from './PipelineFlowRunRow'

/** ms the "Cancel requested" / "Cancel failed" toast stays on screen */
const MUTATION_TOAST_MS = 4000

/** Extracted user-visible strings. Kept out of inline JSX attributes to
 * satisfy the ui-ux-standard ratchet and make a future i18n pass easy. */
const LABEL_FILTER_REPO = 'Filter by repo'
const LABEL_REFRESH = 'Refresh'

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------

export function PipelineFlow() {
  const { t } = useTranslation()
  const { t: tCards } = useTranslation('cards')
  const shared = usePipelineFilter()
  const [localRepoFilter, setLocalRepoFilter] = useState<string | null>(null)
  const repoFilter = shared?.repoFilter ?? localRepoFilter
  const setRepoFilter = shared?.setRepoFilter ?? setLocalRepoFilter
  const repos = shared?.repos ?? getPipelineRepos()
  const [mutating, setMutating] = useState<number | null>(null)
  const [mutationMsg, setMutationMsg] = useState<string | null>(null)
  // Prefer shared unified data; fall back to individual fetch when standalone.
  const unifiedData = usePipelineData()
  const hasUnified = !!unifiedData
  const individual = usePipelineFlow(repoFilter, !hasUnified)

  const data = hasUnified ? unifiedData.flow : individual.data
  const isLoading = hasUnified ? unifiedData.isLoading : individual.isLoading
  const isRefreshing = hasUnified ? unifiedData.isRefreshing : individual.isRefreshing
  const error = hasUnified ? unifiedData.error : individual.error
  const refetch = hasUnified ? unifiedData.refetch : individual.refetch
  const { run: runMutation } = usePipelineMutations()
  const { isDemoMode } = useDemoMode()

  const runs = useMemo(() => data?.runs ?? [], [data])
  const hasData = runs.length > 0
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: isDemoMode })

  // Auto-clear mutation message after a few seconds
  useEffect(() => {
    if (!mutationMsg) return
    const t = setTimeout(() => setMutationMsg(null), MUTATION_TOAST_MS)
    return () => clearTimeout(t)
  }, [mutationMsg])

  async function onCancel(runId: number, repo: string) {
    setMutating(runId)
    setMutationMsg(null)
    const result = await runMutation('cancel', repo, runId)
    setMutating(null)
    setMutationMsg(result.ok ? `Cancel requested for #${runId}` : `Cancel failed: ${result.error ?? result.status}`)
    if (result.ok) refetch()
  }

  if (error && !hasData) {
    return (
      <div className="p-4 h-full flex items-center justify-center text-sm text-red-400">
        {tCards('pipelines.failedToLoadPipelineFlow')} {error}
      </div>
    )
  }

  return (
    <div className="p-3 h-full flex flex-col gap-2 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {repoFilter && <RepoSubtitle repo={repoFilter} />}
          <span>{runs.length} in flight</span>
          <EmbedButton
            cardType="pipeline-flow"
            cardTitle="Live Runs"
            currentRepo={repoFilter}
          />
          <button
            type="button"
            onClick={() => refetch()}
            className="hover:text-foreground flex items-center gap-1"
            aria-label={LABEL_REFRESH}
          >
            <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {mutationMsg && (
        <div className="text-xs text-muted-foreground px-1 py-0.5">{mutationMsg}</div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {runs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No runs in flight.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {runs.map((r) => (
              <RunRow
                key={`${r.run.repo}:${r.run.id}`}
                run={r}
                canMutate={!isDemoMode}
                mutating={mutating === r.run.id}
                onCancel={onCancel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
