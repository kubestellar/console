/**
 * NightlyReleasePulse — NightlyE2E-style card showing per-workflow
 * run dots with hover popups, trend indicators, and clickable links.
 *
 * Multi-repo aware:
 * - On /ci-cd (inside PipelineFilterProvider): reads shared selection,
 *   shows one row per workflow per selected repo.
 * - On other dashboards (no provider): shows an input to type owner/repo.
 *
 * Uses the matrix view for per-workflow dot rows (already has per-repo
 * per-workflow history) and the pulse view for the hero header.
 */
import { useState, useMemo } from 'react'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  Loader2,
  ClipboardCheck,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useCardLoadingState } from '../CardDataContext'
import { usePipelinePulse, usePipelineMatrix, type Conclusion } from '../../../hooks/useGitHubPipelines'
import { usePipelineFilter } from './PipelineFilterContext'
import { formatTimeAgo } from '../../../lib/formatters'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'
import { usePipelineData } from './PipelineDataContext'
import { RepoSubtitle } from './RepoSubtitle'
import { EmbedButton } from './EmbedButton'
import { useMissions } from '../../../hooks/useMissions'
import { cn } from '../../../lib/cn'
import type { DotInfo } from './pulse-utils'
import { MAX_DOTS, MATRIX_DAYS, formatCron, computeTrend } from './NightlyReleasePulse.constants'
import { TrendIndicator, WorkflowRow, StandaloneRepoInput } from './NightlyReleasePulse.parts'

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function NightlyReleasePulse() {
  const { t } = useTranslation('cards')
  const { startMission } = useMissions()
  const shared = usePipelineFilter()
  const [standaloneRepo, setStandaloneRepo] = useState('')
  const effectiveRepoFilter = shared
    ? shared.repoFilter
    : standaloneRepo.includes('/') ? standaloneRepo.trim() : null

  // Prefer shared unified data from PipelineDataProvider (one fetch for all cards).
  // Fall back to individual fetches when rendered outside the CI/CD dashboard.
  const unifiedData = usePipelineData()
  const hasUnified = !!unifiedData
  const individualPulse = usePipelinePulse(effectiveRepoFilter, !hasUnified)
  const individualMatrix = usePipelineMatrix(effectiveRepoFilter, MATRIX_DAYS, !hasUnified)

  const pulseData = hasUnified ? unifiedData.pulse : individualPulse.data
  const pulseLoading = hasUnified ? unifiedData.isLoading : individualPulse.isLoading
  const pulseRefreshing = hasUnified ? unifiedData.isRefreshing : individualPulse.isRefreshing
  const pulseError = hasUnified ? unifiedData.error : individualPulse.error
  const refetch = hasUnified ? unifiedData.refetch : individualPulse.refetch
  const matrixData = hasUnified ? unifiedData.matrix : individualMatrix.data
  const matrixLoading = hasUnified ? unifiedData.isLoading : individualMatrix.isLoading
  const matrixRefreshing = hasUnified ? unifiedData.isRefreshing : individualMatrix.isRefreshing
  const { isDemoMode } = useDemoMode()

  const hasData = !!pulseData?.lastRun || (matrixData?.workflows?.length ?? 0) > 0
  useCardLoadingState({
    isLoading: (pulseLoading || matrixLoading) && !hasData,
    isRefreshing: pulseRefreshing || matrixRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode,
  })

  const workflows = useMemo(() => {
    const wfs = matrixData?.workflows ?? []
    if (!shared || shared.selectedRepos.size === 0) return wfs
    return wfs.filter((wf) => shared.selectedRepos.has(wf.repo))
  }, [matrixData, shared])

  const allDots: DotInfo[] = useMemo(() =>
    workflows.flatMap((wf) =>
      [...wf.cells].reverse().slice(0, MAX_DOTS).map((c) => ({
        conclusion: c.conclusion as Conclusion, htmlUrl: c.htmlUrl, date: c.date,
      }))), [workflows])
  const { passRate: overallPassRate, trend: overallTrend } = useMemo(() => computeTrend(allDots), [allDots])

  /** Workflows whose latest conclusion is not "success" — candidates for bulk audit */
  const inactiveWorkflows = useMemo(() =>
    workflows.filter((wf) => {
      const cells = [...wf.cells].reverse()
      const latestConclusion = cells[0]?.conclusion ?? null
      return latestConclusion !== 'success'
    }), [workflows])

  if (pulseError && !hasData) {
    return <div className="p-4 h-full flex items-center justify-center text-sm text-red-400">
      {t('pipelines.failedToLoadReleasePulse')} {pulseError}
    </div>
  }

  const { lastRun, nextCron, streak, streakKind } = pulseData
  const StatusIcon = !lastRun ? AlertTriangle
    : lastRun.conclusion === 'success' ? CheckCircle
    : lastRun.conclusion === 'failure' || lastRun.conclusion === 'timed_out' || lastRun.conclusion === 'startup_failure' ? XCircle
    : lastRun.conclusion === null ? Loader2 : AlertTriangle
  const iconColor = !lastRun ? 'text-muted-foreground'
    : lastRun.conclusion === 'success' ? 'text-green-400'
    : lastRun.conclusion === 'failure' || lastRun.conclusion === 'timed_out' || lastRun.conclusion === 'startup_failure' ? 'text-red-400'
    : lastRun.conclusion === null ? 'text-blue-400 animate-spin' : 'text-yellow-400'

  return (
    <div className="h-full flex flex-col">
      {!shared && <StandaloneRepoInput value={standaloneRepo} onChange={setStandaloneRepo} />}

      <div className="p-4 flex-1 flex flex-col gap-3 min-h-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusIcon size={18} className={cn('shrink-0', iconColor)} />
              <span className="text-base font-semibold text-foreground truncate">
                {lastRun?.releaseTag ?? 'No release yet'}
              </span>
              {lastRun?.releaseTag && (
                <span className="text-2xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 shrink-0">nightly</span>
              )}
            </div>
            {lastRun?.weeklyTag && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <span className="text-2xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">stable</span>
                <span>{lastRun.weeklyTag}</span>
              </div>
            )}
            <div className="mt-0.5">
              <RepoSubtitle repo={effectiveRepoFilter || 'all repos'} />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              {lastRun && <>
                <span>{formatTimeAgo(lastRun.createdAt)}</span>
                <span>&middot;</span>
                <span className="capitalize">{lastRun.conclusion ?? 'running'}</span>
                <span>&middot;</span>
                <span>run #{lastRun.runNumber}</span>
              </>}
            </div>
          </div>
          {lastRun?.htmlUrl && lastRun.htmlUrl !== '#' && (
            <a href={sanitizeUrl(lastRun.htmlUrl)} target="_blank" rel="noreferrer noopener"
              className="text-xs text-muted-foreground hover:text-foreground shrink-0">
              <ExternalLink size={12} />
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
          <div className="rounded-lg bg-secondary/30 px-3 py-2">
            <div className="text-xs text-muted-foreground">Streak</div>
            <div className={cn('text-sm font-medium mt-0.5',
              streakKind === 'success' && 'text-status-success', streakKind === 'failure' && 'text-status-error')}>
              {streak === 0 ? '—' : `${streak}${streakKind === 'success' ? ' pass' : ' fail'}`}
            </div>
          </div>
          <div className="rounded-lg bg-secondary/30 px-3 py-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={10} /> Next</div>
            <div className="text-sm font-medium mt-0.5 text-foreground">{formatCron(nextCron)}</div>
          </div>
          <div className="rounded-lg bg-secondary/30 px-3 py-2">
            <div className="text-xs text-muted-foreground">Overall</div>
            <div className="mt-0.5"><TrendIndicator passRate={overallPassRate} trend={overallTrend} /></div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {workflows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              {!shared && !standaloneRepo.includes('/')
                ? 'Enter an owner/repo above to see workflow runs'
                : 'No workflow activity in this range'}
            </div>
          ) : (
            <div className="flex flex-col">
              {workflows.map((wf) => <WorkflowRow key={`${wf.repo}:${wf.name}`} wf={wf} />)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <EmbedButton
            cardType="nightly-release-pulse"
            cardTitle="Nightly Release Pulse"
            currentRepo={effectiveRepoFilter}
          />
          {inactiveWorkflows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const repoLabel = effectiveRepoFilter || 'all repos'
                const inactiveList = inactiveWorkflows
                  .map((wf) => {
                    const cells = [...wf.cells].reverse()
                    const status = cells[0]?.conclusion ?? 'inactive'
                    return `- ${wf.name} (${wf.repo}): ${status}`
                  })
                  .join('\n')
                startMission({
                  title: `Audit inactive workflows: ${repoLabel}`,
                  description: `Audit all inactive or skipped workflows in ${repoLabel}`,
                  type: 'analyze',
                  initialPrompt: `Audit all inactive or skipped workflows in ${repoLabel}.\n\nThe following workflows have not run successfully recently or are being skipped:\n${inactiveList}\n\nFor each workflow:\n1. Read the YAML file and determine why it's inactive\n2. Categorize: intentional / broken / obsolete / misconfigured\n3. After reviewing all of them, present a summary table and ask:\n   - "Should I create a PR to clean up the obsolete ones?"\n   - "Should I fix the broken ones?"\n   - "No changes needed"`,
                })
              }}
              className="text-xs text-muted-foreground hover:text-yellow-400 flex items-center gap-1"
            >
              <ClipboardCheck className="w-3 h-3" />
              Audit inactive
            </button>
          )}
          <button type="button" onClick={() => refetch()}
            className="text-xs text-muted-foreground hover:text-foreground">
            Refresh
          </button>
        </div>
      </div>
    </div>
  )
}
