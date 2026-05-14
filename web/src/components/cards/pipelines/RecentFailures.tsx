/**
 * RecentFailures — lists the last N failed GitHub Actions runs across the
 * tracked repos, with the first failing step and drill-down to the log.
 *
 * Modal safety: backdrop-click close is disabled on the LogsModal opened
 * from this card (closeOnBackdropClick={false}) so the log filter input is
 * not lost to a stray click. Close is still reachable via Esc and the X
 * button.
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, RefreshCw, FileText, Stethoscope } from 'lucide-react'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useCardLoadingState } from '../CardDataContext'
import {
  usePipelineFailures,
  usePipelineMutations,
  getPipelineRepos,
} from '../../../hooks/useGitHubPipelines'
import { usePipelineFilter } from './PipelineFilterContext'
import { usePipelineData } from './PipelineDataContext'
import { RepoSubtitle } from './RepoSubtitle'
import { EmbedButton } from './EmbedButton'
import { LogsModal } from './LogsModal'
import { useMissions } from '../../../hooks/useMissions'
import { cn } from '../../../lib/cn'
import { formatTimeAgo } from '../../../lib/formatters'
import { MS_PER_SECOND, MS_PER_HOUR, SECONDS_PER_MINUTE } from '../../../lib/constants/time'

/** Maximum ms duration we format compactly (1 hr). Over this, show "1h+" */
const SHORT_DURATION_CAP_MS = MS_PER_HOUR

/** Extracted user-visible strings. Kept out of inline JSX attributes to
 * satisfy the ui-ux-standard ratchet and make a future i18n pass easy. */
const LABEL_FILTER_REPO = 'Filter by repo'
const LABEL_REFRESH = 'Refresh'
const TITLE_VIEW_LOG = 'View log tail'
const TITLE_OPEN_RUN = 'Open run on GitHub'
const TITLE_DIAGNOSE = 'Diagnose with AI'

function formatDuration(ms: number): string {
  if (ms < MS_PER_SECOND) return `${ms}ms`
  const secs = Math.floor(ms / MS_PER_SECOND)
  if (secs < SECONDS_PER_MINUTE) return `${secs}s`
  if (ms >= SHORT_DURATION_CAP_MS) return '1h+'
  return `${Math.floor(secs / SECONDS_PER_MINUTE)}m ${secs % SECONDS_PER_MINUTE}s`
}

export function RecentFailures() {
  const { t } = useTranslation()
  const { t: tCards } = useTranslation('cards')
  const shared = usePipelineFilter()
  const [localRepoFilter, setLocalRepoFilter] = useState<string | null>(null)
  const repoFilter = shared?.repoFilter ?? localRepoFilter
  const setRepoFilter = shared?.setRepoFilter ?? setLocalRepoFilter
  const repos = shared?.repos ?? getPipelineRepos()
  const [logCtx, setLogCtx] = useState<{ repo: string; jobId: number; title: string } | null>(null)
  const [mutating, setMutating] = useState<number | null>(null)
  const [mutationMsg, setMutationMsg] = useState<string | null>(null)

  // Prefer shared unified data; fall back to individual fetch when standalone.
  const unifiedData = usePipelineData()
  const hasUnified = !!unifiedData
  const individual = usePipelineFailures(repoFilter, !hasUnified)

  const data = hasUnified ? unifiedData.failures : individual.data
  const isLoading = hasUnified ? unifiedData.isLoading : individual.isLoading
  const isRefreshing = hasUnified ? unifiedData.isRefreshing : individual.isRefreshing
  const error = hasUnified ? unifiedData.error : individual.error
  const refetch = hasUnified ? unifiedData.refetch : individual.refetch
  const { run: runMutation } = usePipelineMutations()
  const { isDemoMode } = useDemoMode()
  const { startMission } = useMissions()

  const hasData = (data?.runs?.length ?? 0) > 0
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: isDemoMode })

  const rows = useMemo(() => data?.runs ?? [], [data])

  async function onRerun(runId: number, repo: string) {
    setMutating(runId)
    setMutationMsg(null)
    const result = await runMutation('rerun', repo, runId)
    setMutating(null)
    setMutationMsg(result.ok ? `Re-run triggered for #${runId}` : `Re-run failed: ${result.error ?? result.status}`)
    if (result.ok) refetch()
  }

  if (error && !hasData) {
    return (
      <div className="p-4 h-full flex items-center justify-center text-sm text-red-400">
        {tCards('pipelines.failedToLoadRecentFailures')} {error}
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
          <span>{rows.length} failures</span>
          <EmbedButton
            cardType="recent-failures"
            cardTitle="Recent Failures"
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
        <div className="text-[11px] text-muted-foreground px-1 py-0.5">{mutationMsg}</div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No recent failures 🎉
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2 font-normal">Workflow</th>
                <th className="py-1 pr-2 font-normal">Failed step</th>
                <th className="py-1 pr-2 font-normal">Branch</th>
                <th className="py-1 pr-2 font-normal">When</th>
                <th className="py-1 pr-2 font-normal">Duration</th>
                <th className="py-1 pr-2 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.repo}:${r.runId}`} className="border-t border-border/50">
                  <td className="py-1.5 pr-2">
                    <div className="font-medium text-foreground truncate">{r.workflow}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{r.repo}</div>
                  </td>
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {r.failedStep ? (
                      <span className="truncate inline-block max-w-[220px]" title={`${r.failedStep.jobName} / ${r.failedStep.stepName}`}>
                        {r.failedStep.stepName}
                      </span>
                    ) : (
                      <span className="opacity-50">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-muted-foreground truncate max-w-[120px]" title={r.branch}>
                    {r.branch}
                    {(r.pullRequests?.length ?? 0) > 0 && (
                      <a href={r.pullRequests![0].url || `https://github.com/${r.repo}/pull/${r.pullRequests![0].number}`} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-400 hover:underline">#{r.pullRequests![0].number}</a>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-muted-foreground whitespace-nowrap">
                    {formatTimeAgo(r.createdAt)}
                  </td>
                  <td className="py-1.5 pr-2 text-muted-foreground whitespace-nowrap">
                    {formatDuration(r.durationMs)}
                  </td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startMission({
                        title: `Diagnose: ${r.workflow}`,
                        description: `Diagnose failing workflow ${r.workflow} on ${r.repo}`,
                        type: 'troubleshoot',
                        initialPrompt: `Diagnose why the "${r.workflow}" workflow failed on ${r.repo} (branch: ${r.branch}).\n\nRun URL: ${r.htmlUrl}\n\n${r.failedStep ? `Failed step: ${r.failedStep.stepName}` : ''}\n\nPlease:\n1. Check the workflow logs and identify the root cause.\n2. Tell me what went wrong, then ask:\n   - "Should I create a fix?"\n   - "Show me more details"\n3. If I say fix it, create a branch with the fix and open a PR.`,
                      })}
                      className="text-muted-foreground hover:text-blue-400 p-1 rounded hover:bg-blue-500/10"
                      title={TITLE_DIAGNOSE}
                    >
                      <Stethoscope className="w-3 h-3" />
                    </button>
                    {r.failedStep && (
                      <button
                        type="button"
                        onClick={() => setLogCtx({
                          repo: r.repo,
                          jobId: r.failedStep!.jobId,
                          title: `${r.workflow} / ${r.failedStep!.stepName}`,
                        })}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                        title={TITLE_VIEW_LOG}
                      >
                        <FileText className="w-3 h-3" /> Log
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={mutating === r.runId || isDemoMode}
                      onClick={() => onRerun(r.runId, r.repo)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded ml-1',
                        isDemoMode ? 'text-muted-foreground/50 cursor-not-allowed' : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground'
                      )}
                      title={isDemoMode ? 'Log in to re-run workflows' : 'Re-run this workflow'}
                    >
                      <RefreshCw className={cn('w-3 h-3', mutating === r.runId && 'animate-spin')} /> Re-run
                    </button>
                    <a
                      href={r.htmlUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground ml-1"
                      title={TITLE_OPEN_RUN}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {logCtx && (
        <LogsModal
          repo={logCtx.repo}
          jobId={logCtx.jobId}
          title={logCtx.title}
          onClose={() => setLogCtx(null)}
        />
      )}
    </div>
  )
}
