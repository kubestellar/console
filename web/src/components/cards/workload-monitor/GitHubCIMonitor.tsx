import { useState, useMemo, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react'
import {
  GitBranch, AlertTriangle, CheckCircle, XCircle,
  Clock, Loader2, ExternalLink, Key, Settings, Plus, X, Check,
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { Pagination } from '../../ui/Pagination'
import { CardControls } from '../../ui/CardControls'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { CardSearchInput, CardAIActions } from '../../../lib/cards'
import { useCardLoadingState } from '../CardDataContext'
import type { SortDirection } from '../../../lib/cards/cardHooks'
import { cn } from '../../../lib/cn'
import { WorkloadMonitorAlerts } from './WorkloadMonitorAlerts'
import type { MonitorIssue } from '../../../types/workloadMonitor'

interface GitHubCIMonitorProps {
  config?: Record<string, unknown>
}

export interface GitHubCIMonitorRef {
  refresh: () => void
}

// Decode base64 encoded token from localStorage
const decodeToken = (encoded: string): string => {
  try {
    return atob(encoded)
  } catch {
    return encoded // Return as-is if not encoded (backwards compatibility)
  }
}

interface GitHubCIConfig {
  repos?: string[]
  token?: string
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
}

type SortField = 'name' | 'status' | 'repo' | 'branch'

const CONCLUSION_BADGE: Record<string, string> = {
  success: 'bg-green-500/20 text-green-400',
  failure: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
  skipped: 'bg-gray-500/20 text-gray-400',
  timed_out: 'bg-orange-500/20 text-orange-400',
  action_required: 'bg-yellow-500/20 text-yellow-400',
}

const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  queued: 'bg-yellow-500/20 text-yellow-400',
  waiting: 'bg-purple-500/20 text-purple-400',
}

const CONCLUSION_ORDER: Record<string, number> = {
  failure: 0,
  timed_out: 1,
  action_required: 2,
  cancelled: 3,
  skipped: 4,
  success: 5,
}

const SORT_OPTIONS = [
  { value: 'status', label: 'Status' },
  { value: 'name', label: 'Name' },
  { value: 'repo', label: 'Repo' },
  { value: 'branch', label: 'Branch' },
]

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

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const REPOS_STORAGE_KEY = 'github_ci_repos'
const DEFAULT_REPOS = ['kubestellar/kubestellar', 'kubestellar/console']

function loadRepos(): string[] {
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

function saveRepos(repos: string[]) {
  localStorage.setItem(REPOS_STORAGE_KEY, JSON.stringify(repos))
}

export const GitHubCIMonitor = forwardRef<GitHubCIMonitorRef, GitHubCIMonitorProps>(function GitHubCIMonitor({ config }, ref) {
  const ghConfig = config as GitHubCIConfig | undefined
  const [workflows, setWorkflows] = useState<WorkflowRun[]>(DEMO_WORKFLOWS)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isUsingDemoData, setIsUsingDemoData] = useState(true)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  // Repo configuration
  const [repos, setRepos] = useState<string[]>(() => ghConfig?.repos || loadRepos())
  const [isEditingRepos, setIsEditingRepos] = useState(false)
  const [newRepoInput, setNewRepoInput] = useState('')

  useCardLoadingState({ isLoading, hasAnyData: workflows.length > 0 })

  const fetchWorkflows = useCallback(async (isRefresh = false) => {
    const storedToken = localStorage.getItem('github_token')
    const token = ghConfig?.token || (storedToken ? decodeToken(storedToken) : null)
    if (!token) {
      // Use demo data
      setWorkflows(DEMO_WORKFLOWS)
      setIsUsingDemoData(true)
      return
    }

    if (!isRefresh) setIsLoading(true)
    setError(null)

    try {
      const allRuns: WorkflowRun[] = []
      for (const repo of repos) {
        const response = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=10`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
        })
        if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)
        const data = await response.json()
        const runs = (data.workflow_runs || []).map((run: Record<string, unknown>) => ({
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
        }))
        allRuns.push(...runs)
      }
      if (allRuns.length > 0) {
        setWorkflows(allRuns)
        setIsUsingDemoData(false)
        setLastFetched(new Date())
      } else {
        setWorkflows(DEMO_WORKFLOWS)
        setIsUsingDemoData(true)
      }
    } catch (err) {
      console.error('[GitHubCIMonitor] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch workflows')
      setIsUsingDemoData(true)
      // Keep demo data on error
    } finally {
      setIsLoading(false)
    }
  }, [repos, ghConfig?.token])

  // Expose refresh method via ref for CardWrapper
  useImperativeHandle(ref, () => ({
    refresh: () => fetchWorkflows(true)
  }), [fetchWorkflows])

  // Repo management handlers
  const handleAddRepo = useCallback(() => {
    const repo = newRepoInput.trim()
    if (!repo) return
    // Validate format: owner/repo
    if (!repo.match(/^[\w-]+\/[\w.-]+$/)) {
      return // Invalid format
    }
    if (repos.includes(repo)) {
      setNewRepoInput('')
      return // Already exists
    }
    const updatedRepos = [...repos, repo]
    setRepos(updatedRepos)
    saveRepos(updatedRepos)
    setNewRepoInput('')
    // Refresh to fetch new repo data
    setTimeout(() => fetchWorkflows(true), 100)
  }, [newRepoInput, repos, fetchWorkflows])

  const handleRemoveRepo = useCallback((repo: string) => {
    const updatedRepos = repos.filter(r => r !== repo)
    if (updatedRepos.length === 0) return // Keep at least one repo
    setRepos(updatedRepos)
    saveRepos(updatedRepos)
    // Immediately filter out workflows from removed repo
    setWorkflows(prev => prev.filter(w => w.repo !== repo))
    // Refresh to update data
    setTimeout(() => fetchWorkflows(true), 100)
  }, [repos, fetchWorkflows])

  useEffect(() => {
    fetchWorkflows()
    const interval = setInterval(() => fetchWorkflows(true), 60_000)
    return () => clearInterval(interval)
  }, [fetchWorkflows])

  // Listen for token changes in localStorage (e.g., when user adds token in Settings)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'github_token') {
        fetchWorkflows(true)
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [fetchWorkflows])

  // Stats
  const stats = useMemo(() => {
    const total = workflows.length
    const failed = workflows.filter(w => w.conclusion === 'failure' || w.conclusion === 'timed_out').length
    const inProgress = workflows.filter(w => w.status === 'in_progress').length
    const queued = workflows.filter(w => w.status === 'queued' || w.status === 'waiting').length
    const passed = workflows.filter(w => w.conclusion === 'success').length
    const successRate = total > 0 ? Math.round((passed / total) * 100) : 0
    return { total, failed, inProgress, queued, passed, successRate }
  }, [workflows])

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
  } = useCardData(workflows, {
    filter: {
      searchFields: ['name', 'repo', 'branch', 'event'] as (keyof WorkflowRun)[],
    },
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
        branch: commonComparators.string('branch'),
      },
    },
    defaultLimit: 8,
  })

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
          order: 0,
        },
        severity: w.conclusion === 'failure' ? 'critical' as const : 'warning' as const,
        title: `${w.name} ${w.conclusion} on ${w.branch}`,
        description: `Workflow run #${w.runNumber} in ${w.repo} ${w.conclusion}. Event: ${w.event}. Updated ${formatTimeAgo(w.updatedAt)}.`,
        detectedAt: w.updatedAt,
      }))
  }, [workflows])

  const overallHealth = useMemo(() => {
    if (stats.failed > 0) return 'degraded'
    if (stats.total === 0) return 'unknown'
    return 'healthy'
  }, [stats])

  if (isLoading && workflows.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={160} height={20} />
        <div className="grid grid-cols-4 gap-2">
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
        {!isUsingDemoData && lastFetched && (
          <span className="text-[10px] text-muted-foreground/60">
            Updated {formatTimeAgo(lastFetched.toISOString())}
          </span>
        )}
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded ml-auto',
          overallHealth === 'healthy' ? 'bg-green-500/20 text-green-400' :
          overallHealth === 'degraded' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-gray-500/20 text-gray-400',
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
            <button
              onClick={handleAddRepo}
              disabled={!newRepoInput.trim()}
              className="p-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Add repo"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsEditingRepos(false)}
              className="p-1 rounded hover:bg-secondary text-muted-foreground"
              title="Done"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
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
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-green-400">{stats.successRate}%</p>
          <p className="text-[10px] text-muted-foreground">Pass Rate</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-red-400">{stats.failed}</p>
          <p className="text-[10px] text-muted-foreground">Failed</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-blue-400">{stats.inProgress}</p>
          <p className="text-[10px] text-muted-foreground">Running</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-yellow-400">{stats.queued}</p>
          <p className="text-[10px] text-muted-foreground">Queued</p>
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
        placeholder="Search workflows..."
      />

      {/* Workflow runs */}
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {items.map(w => {
          const status = effectiveStatus(w)
          const badgeClass = w.status === 'completed'
            ? (CONCLUSION_BADGE[w.conclusion || ''] || 'bg-gray-500/20 text-gray-400')
            : (STATUS_BADGE[w.status] || 'bg-gray-500/20 text-gray-400')
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
                <span className="text-[10px] text-muted-foreground truncate block">
                  {w.repo.split('/')[1]} · {w.branch}
                </span>
              </div>
              <span className={cn('text-[10px] px-1 py-0.5 rounded shrink-0', badgeClass)}>
                {status}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatTimeAgo(w.updatedAt)}
              </span>
              {(w.conclusion === 'failure' || w.conclusion === 'timed_out') && (
                <CardAIActions
                  resource={{ kind: 'GitHubWorkflow', name: w.name, status: w.conclusion }}
                  issues={[{ name: `${w.conclusion} on ${w.repo}/${w.branch}`, message: `Run #${w.runNumber}, event: ${w.event}` }]}
                  showRepair={false}
                />
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
})
