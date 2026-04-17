import { useState, useMemo, useImperativeHandle, type Ref } from 'react'
import {
  GitBranch, AlertTriangle, CheckCircle, XCircle,
  Clock, Loader2, ExternalLink, Key, Settings, Plus, X, Check, Stethoscope } from 'lucide-react'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../../lib/constants'
import { Button } from '../../ui/Button'
import { Skeleton } from '../../ui/Skeleton'
import { Pagination } from '../../ui/Pagination'
import { CardControls } from '../../ui/CardControls'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { CardSearchInput, CardAIActions } from '../../../lib/cards/CardComponents'
import { useCardLoadingState } from '../CardDataContext'
import { useCache } from '../../../lib/cache'
import type { SortDirection } from '../../../lib/cards/cardHooks'
import { useMissions } from '../../../hooks/useMissions'
import { GitHubWorkflowRunsResponseSchema } from '../../../lib/schemas'
import { validateResponse } from '../../../lib/schemas/validate'
import { cn } from '../../../lib/cn'
import { WorkloadMonitorAlerts } from './WorkloadMonitorAlerts'
import type { MonitorIssue } from '../../../types/workloadMonitor'
import { useTranslation } from 'react-i18next'
import { formatTimeAgo, loadRepos, saveRepos } from './gitHubCIUtils'
import { usePipelineFilter } from '../pipelines/PipelineFilterContext'
import { RepoSubtitle } from '../pipelines/RepoSubtitle'

interface GitHubCIMonitorProps {
  config?: Record<string, unknown>
}

export interface GitHubCIMonitorRef {
  refresh: () => void
}

interface GitHubCIConfig {
  repos?: string[]
}

interface WorkflowRun {
  id: string
  name: string
  repo: string
  status: 'completed' | 'in_progress' | 'queued' | 'waiting'
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null
  branch: string
  event: string
  runNumber: number
  createdAt: string
  updatedAt: string
  url: string
  prNumber?: number
  prUrl?: string
}

type SortField = 'name' | 'status' | 'repo' | 'branch'

const CONCLUSION_BADGE: Record<string, string> = {
  success: 'bg-green-500/20 text-green-400',
  failure: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground',
  skipped: 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground',
  timed_out: 'bg-orange-500/20 text-orange-400',
  action_required: 'bg-yellow-500/20 text-yellow-400' }

const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  queued: 'bg-yellow-500/20 text-yellow-400',
  waiting: 'bg-purple-500/20 text-purple-400' }

const CONCLUSION_ORDER: Record<string, number> = {
  failure: 0,
  timed_out: 1,
  action_required: 2,
  cancelled: 3,
  skipped: 4,
  success: 5 }

const SORT_OPTIONS = [
  { value: 'status', label: 'Status' },
  { value: 'name', label: 'Name' },
  { value: 'repo', label: 'Repo' },
  { value: 'branch', label: 'Branch' },
]

const TITLE_DIAGNOSE = 'Diagnose with AI'

// Demo data for when GitHub API is not available
const DEMO_WORKFLOWS: WorkflowRun[] = [
  { id: '1', name: 'CI / Build & Test', repo: 'kubestellar/kubestellar', status: 'completed', conclusion: 'success', branch: 'main', event: 'push', runNumber: 1234, createdAt: new Date(Date.now() - 300000).toISOString(), updatedAt: new Date(Date.now() - 60000).toISOString(), url: '#' },
  { id: '2', name: 'CI / Lint', repo: 'kubestellar/kubestellar', status: 'completed', conclusion: 'failure', branch: 'feat/new-feature', event: 'pull_request', runNumber: 1233, createdAt: new Date(Date.now() - 600000).toISOString(), updatedAt: new Date(Date.now() - 300000).toISOString(), url: '#' },
  { id: '3', name: 'Release / Publish', repo: 'kubestellar/kubestellar', status: 'in_progress', conclusion: null, branch: 'main', event: 'workflow_dispatch', runNumber: 1232, createdAt: new Date(Date.now() - 120000).toISOString(), updatedAt: new Date(Date.now() - 30000).toISOString(), url: '#' },
  { id: '4', name: 'E2E Tests', repo: 'kubestellar/console', status: 'completed', conclusion: 'success', branch: 'main', event: 'push', runNumber: 567, createdAt: new Date(Date.now() - 900000).toISOString(), updatedAt: new Date(Date.now() - 600000).toISOString(), url: '#' },
  { id: '5', name: 'CI / Build & Test', repo: 'kubestellar/console', status: 'completed', conclusion: 'success', branch: 'feat/workload-monitor', event: 'pull_request', runNumber: 566, createdAt: new Date(Date.now() - 1200000).toISOString(), updatedAt: new Date(Date.now() - 900000).toISOString(), url: '#' },
  { id: '6', name: 'Deploy Preview', repo: 'kubestellar/console', status: 'queued', conclusion: null, branch: 'feat/card-factory', event: 'pull_request', runNumber: 565, createdAt: new Date(Date.now() - 60000).toISOString(), updatedAt: new Date(Date.now() - 30000).toISOString(), url: '#' },
  { id: '7', name: 'Security Scan', repo: 'kubestellar/kubestellar', status: 'completed', conclusion: 'timed_out', branch: 'main', event: 'schedule', runNumber: 1231, createdAt: new Date(Date.now() - 3600000).toISOString(), updatedAt: new Date(Date.now() - 1800000).toISOString(), url: '#' },
  { id: '8', name: 'Dependabot', repo: 'kubestellar/kubestellar', status: 'completed', conclusion: 'success', branch: 'dependabot/npm/react-19', event: 'pull_request', runNumber: 1230, createdAt: new Date(Date.now() - 7200000).toISOString(), updatedAt: new Date(Date.now() - 3600000).toISOString(), url: '#' },
]


export function GitHubCIMonitor({ config, ref }: GitHubCIMonitorProps & { ref?: Ref<GitHubCIMonitorRef> }) {
  const { t } = useTranslation()
  const { startMission } = useMissions()
  const ghConfig = config as GitHubCIConfig | undefined
  const shared = usePipelineFilter()

  // Repo configuration — shared filter overrides when on /ci-cd
  const [localRepos, setLocalRepos] = useState<string[]>(() => ghConfig?.repos || loadRepos())
  const repos = shared?.repoFilter ? [shared.repoFilter] : localRepos
  const setRepos: React.Dispatch<React.SetStateAction<string[]>> = shared?.repoFilter ? () => {} : setLocalRepos
  const [isEditingRepos, setIsEditingRepos] = useState(false)
  const [newRepoInput, setNewRepoInput] = useState('')

  // CI data via useCache (persists across navigation)
  const reposKey = [...repos].sort().join(',')

  const { data: ciData, isLoading, isRefreshing, isFailed, consecutiveFailures, refetch } = useCache<{ workflows: WorkflowRun[], isDemo: boolean }>({
    key: `github-ci:${reposKey}`,
    category: 'default',
    initialData: { workflows: [], isDemo: false },
    demoData: { workflows: DEMO_WORKFLOWS, isDemo: true },
    persist: true,
    fetcher: async () => {
      const allRuns: WorkflowRun[] = []
      for (const repo of repos) {
        try {
          const response = await fetch(`/api/github/repos/${repo}/actions/runs?per_page=10`, {
            headers: { Accept: 'application/vnd.github.v3+json' },
            signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
          if (response.status === 401 || response.status === 403) {
            // Token invalid or missing — fall back to demo data
            return { workflows: DEMO_WORKFLOWS, isDemo: true }
          }
          if (!response.ok) continue // Skip this repo on other errors
          // Use .catch() directly to prevent Firefox from firing unhandledrejection
          // before the outer try/catch processes the rejection (Firefox-specific timing issue).
          const rawGH = await response.json().catch(() => null)
          const data = validateResponse(GitHubWorkflowRunsResponseSchema, rawGH, `/api/github/repos/${repo}/actions/runs`)
          if (!data) continue
          const prFromCommit = /\(#(\d+)\)\s*$/
          const runs = (data.workflow_runs || []).map((run: Record<string, unknown>) => {
            const prs = run.pull_requests as { number: number; url: string }[] | undefined
            let prNumber: number | undefined
            let prUrl: string | undefined
            if (prs && prs.length > 0) {
              prNumber = prs[0].number
              prUrl = `https://github.com/${repo}/pull/${prs[0].number}`
            } else if (run.event === 'push') {
              const msg = (run.head_commit as { message?: string } | undefined)?.message ?? ''
              const m = prFromCommit.exec(msg)
              if (m) {
                prNumber = parseInt(m[1], 10)
                prUrl = `https://github.com/${repo}/pull/${m[1]}`
              }
            }
            return {
              id: String(run.id),
              name: run.name as string,
              repo,
              status: run.status as WorkflowRun['status'],
              conclusion: run.conclusion as WorkflowRun['conclusion'],
              branch: (run.head_branch || 'unknown') as string,
              event: (run.event || 'unknown') as string,
              runNumber: run.run_number as number,
              createdAt: run.created_at as string,
              updatedAt: run.updated_at as string,
              url: (run.html_url || '#') as string,
              prNumber,
              prUrl,
            }
          })
          allRuns.push(...runs)
        } catch {
          // Network error for this repo — skip it
          continue
        }
      }

      if (allRuns.length > 0) {
        return { workflows: allRuns, isDemo: false }
      }
      return { workflows: DEMO_WORKFLOWS, isDemo: true }
    } })

  const workflows = ciData.workflows
  // Don't report demo during cache hydration — initialData has isDemo: true as a
  // placeholder. Only report demo once loading completes and we know the real state.
  const isUsingDemoData = isLoading ? false : ciData.isDemo
  const error = isFailed ? 'Failed to fetch workflows' : null

  const hasData = workflows.length > 0
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: isUsingDemoData, isFailed, consecutiveFailures })

  // Expose refresh method via ref for CardWrapper
  useImperativeHandle(ref, () => ({
    refresh: () => refetch()
  }), [refetch])

  // Repo management handlers
  const handleAddRepo = () => {
    const repo = newRepoInput.trim()
    if (!repo) return
    if (!repo.match(/^[\w-]+\/[\w.-]+$/)) return
    if (repos.includes(repo)) {
      setNewRepoInput('')
      return
    }
    const updatedRepos = [...repos, repo]
    setRepos(updatedRepos)
    saveRepos(updatedRepos)
    setNewRepoInput('')
  }

  const handleRemoveRepo = (repo: string) => {
    const updatedRepos = repos.filter(r => r !== repo)
    if (updatedRepos.length === 0) return
    setRepos(updatedRepos)
    saveRepos(updatedRepos)
  }

  // Stats
  const stats = (() => {
    const total = workflows.length
    const failed = workflows.filter(w => w.conclusion === 'failure' || w.conclusion === 'timed_out').length
    const inProgress = workflows.filter(w => w.status === 'in_progress').length
    const queued = workflows.filter(w => w.status === 'queued' || w.status === 'waiting').length
    const passed = workflows.filter(w => w.conclusion === 'success').length
    const successRate = total > 0 ? Math.round((passed / total) * 100) : 0
    return { total, failed, inProgress, queued, passed, successRate }
  })()

  const effectiveStatus = (w: WorkflowRun): string => {
    if (w.status !== 'completed') return w.status
    return w.conclusion || 'unknown'
  }

  const {
    items,
    totalItems,
    currentPage,
    totalPages,
    goToPage,
    needsPagination,
    itemsPerPage,
    setItemsPerPage,
    filters,
    sorting,
    containerRef,
    containerStyle } = useCardData(workflows, {
    filter: {
      searchFields: ['name', 'repo', 'branch', 'event'] as (keyof WorkflowRun)[] },
    sort: {
      defaultField: 'status' as SortField,
      defaultDirection: 'asc' as SortDirection,
      comparators: {
        name: commonComparators.string('name'),
        status: (a, b) => {
          const aOrder = a.conclusion ? (CONCLUSION_ORDER[a.conclusion] ?? 5) : -1
          const bOrder = b.conclusion ? (CONCLUSION_ORDER[b.conclusion] ?? 5) : -1
          return aOrder - bOrder
        },
        repo: commonComparators.string('repo'),
        branch: commonComparators.string('branch') } },
    defaultLimit: 8 })

  // Synthesize issues
  const issues = useMemo<MonitorIssue[]>(() => {
    return workflows
      .filter(w => w.conclusion === 'failure' || w.conclusion === 'timed_out')
      .map(w => ({
        id: `gh-${w.id}`,
        resource: {
          id: `WorkflowRun/${w.repo}/${w.name}`,
          kind: 'WorkflowRun',
          name: w.name,
          namespace: w.repo,
          cluster: 'github',
          status: 'unhealthy' as const,
          category: 'workload' as const,
          lastChecked: w.updatedAt,
          optional: false,
          order: 0 },
        severity: w.conclusion === 'failure' ? 'critical' as const : 'warning' as const,
        title: `${w.name} ${w.conclusion} on ${w.branch}`,
        description: `Workflow run #${w.runNumber} in ${w.repo} ${w.conclusion}. Event: ${w.event}. Updated ${formatTimeAgo(w.updatedAt)}.`,
        detectedAt: w.updatedAt }))
  }, [workflows])

  const overallHealth = (() => {
    if (stats.failed > 0) return 'degraded'
    if (stats.total === 0) return 'unknown'
    return 'healthy'
  })()

  if (isLoading && workflows.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={160} height={20} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={48} />
          ))}
        </div>
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="rounded-lg bg-card/50 border border-border p-2.5 mb-3 flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-sm font-medium text-foreground">GitHub CI</span>
        {shared && shared.repoFilter && <RepoSubtitle repo={shared.repoFilter} />}
        <button
          onClick={() => setIsEditingRepos(!isEditingRepos)}
          className={cn(
            "text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1",
            isEditingRepos && "text-purple-400"
          )}
          title="Configure repos"
        >
          {repos.length} repos
          <Settings className="w-3 h-3" />
        </button>
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded ml-auto',
          overallHealth === 'healthy' ? 'bg-green-500/20 text-green-400' :
          overallHealth === 'degraded' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground',
        )}>
          {overallHealth}
        </span>
      </div>

      {/* Repo editor */}
      {isEditingRepos && (
        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 mb-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newRepoInput}
              onChange={(e) => setNewRepoInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddRepo()}
              placeholder="owner/repo (e.g., facebook/react)"
              className="flex-1 px-2 py-1 text-xs rounded bg-secondary border border-border text-foreground"
            />
            <Button
              variant="accent"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={handleAddRepo}
              disabled={!newRepoInput.trim()}
              title="Add repo"
              className="p-1 rounded"
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Check className="w-3.5 h-3.5" />}
              onClick={() => setIsEditingRepos(false)}
              title="Done"
              className="p-1 rounded hover:bg-secondary"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {repos.map((repo) => (
              <span
                key={repo}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs"
              >
                {repo}
                {repos.length > 1 && (
                  <button
                    onClick={() => handleRemoveRepo(repo)}
                    className="hover:text-red-400 transition-colors"
                    title="Remove repo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Demo data indicator - no token configured */}
      {isUsingDemoData && !error && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2 flex items-center gap-2 mb-2">
          <Key className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <p className="text-xs text-yellow-400/70 flex-1">
            No GitHub token configured — showing sample data.
          </p>
          <a
            href="/settings#github-token"
            className="text-xs px-2 py-0.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded transition-colors whitespace-nowrap"
          >
            Add Token
          </a>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2 flex items-start gap-2 mb-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-400/70">{error}</p>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-green-400">{stats.successRate}%</p>
          <p className="text-2xs text-muted-foreground">Pass Rate</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-red-400">{stats.failed}</p>
          <p className="text-2xs text-muted-foreground">{t('common.failed')}</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-blue-400">{stats.inProgress}</p>
          <p className="text-2xs text-muted-foreground">{t('common.running')}</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-yellow-400">{stats.queued}</p>
          <p className="text-2xs text-muted-foreground">Queued</p>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-end mb-2">
        <CardControls
          limit={itemsPerPage}
          onLimitChange={setItemsPerPage}
          sortBy={sorting.sortBy}
          sortOptions={SORT_OPTIONS}
          onSortChange={(v) => sorting.setSortBy(v as SortField)}
          sortDirection={sorting.sortDirection}
          onSortDirectionChange={sorting.setSortDirection}
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={filters.search}
        onChange={filters.setSearch}
        placeholder={t('common.searchWorkflows')}
      />

      {/* Workflow runs */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-0.5" style={containerStyle}>
        {items.map(w => {
          const status = effectiveStatus(w)
          const badgeClass = w.status === 'completed'
            ? (CONCLUSION_BADGE[w.conclusion || ''] || 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground')
            : (STATUS_BADGE[w.status] || 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground')
          const StatusIcon = w.conclusion === 'success' ? CheckCircle :
                             w.conclusion === 'failure' ? XCircle :
                             w.status === 'in_progress' ? Loader2 :
                             w.status === 'queued' ? Clock : AlertTriangle

          return (
            <div
              key={w.id}
              className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-card/30 transition-colors"
            >
              <StatusIcon className={cn(
                'w-3.5 h-3.5 shrink-0',
                w.conclusion === 'success' ? 'text-green-400' :
                w.conclusion === 'failure' ? 'text-red-400' :
                w.status === 'in_progress' ? 'text-blue-400 animate-spin' :
                'text-muted-foreground',
              )} />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-foreground truncate block">{w.name}</span>
                <span className="text-2xs text-muted-foreground truncate block">
                  {w.repo.split('/')[1]} · {w.branch}
                  {w.prNumber && (
                    <a href={w.prUrl || `https://github.com/${w.repo}/pull/${w.prNumber}`} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-400 hover:underline">#{w.prNumber}</a>
                  )}
                </span>
              </div>
              <span className={cn('text-2xs px-1 py-0.5 rounded shrink-0', badgeClass)}>
                {status}
              </span>
              <span className="text-2xs text-muted-foreground shrink-0">
                {formatTimeAgo(w.updatedAt)}
              </span>
              {(w.conclusion === 'failure' || w.conclusion === 'timed_out') && (
                <>
                  <button
                    type="button"
                    onClick={() => startMission({
                      title: `Diagnose: ${w.name}`,
                      description: `Diagnose failing workflow ${w.name} on ${w.repo}`,
                      type: 'troubleshoot',
                      initialPrompt: `Diagnose why the "${w.name}" workflow failed on ${w.repo} (branch: ${w.branch}).\n\nRun URL: ${w.url}\n\nPlease:\n1. Check the workflow logs and identify the root cause.\n2. Tell me what went wrong, then ask:\n   - "Should I create a fix?"\n   - "Show me more details"\n3. If I say fix it, create a branch with the fix and open a PR.`,
                    })}
                    className="text-muted-foreground hover:text-blue-400 p-1 rounded hover:bg-blue-500/10 shrink-0"
                    title={TITLE_DIAGNOSE}
                  >
                    <Stethoscope className="w-3 h-3" />
                  </button>
                  <CardAIActions
                    resource={{ kind: 'GitHubWorkflow', name: w.name, status: w.conclusion }}
                    issues={[{ name: `${w.conclusion} on ${w.repo}/${w.branch}`, message: `Run #${w.runNumber}, event: ${w.event}` }]}
                    showRepair={false}
                  />
                </>
              )}
              {w.url !== '#' && (
                <a
                  href={w.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-0.5 rounded hover:bg-secondary transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
              )}
            </div>
          )
        })}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No matching workflows.</p>
        )}
      </div>

      {/* Pagination */}
      {needsPagination && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
            onPageChange={goToPage}
          />
        </div>
      )}

      {/* Alerts with inline diagnose buttons */}
      <WorkloadMonitorAlerts issues={issues} monitorType="GitHub CI" />
    </div>
  )
}
