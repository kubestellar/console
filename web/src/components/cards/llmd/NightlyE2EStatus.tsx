import { useMemo } from 'react'
import {
  Moon, CheckCircle, XCircle, Loader2, Clock,
  ExternalLink, AlertTriangle, Key,
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { useCardLoadingState } from '../CardDataContext'
import { useCache } from '../../../lib/cache'
import { cn } from '../../../lib/cn'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NightlyWorkflowConfig {
  repo: string
  workflowFile: string
  label: string
  platform: 'OpenShift' | 'GKE' | 'Both'
  guide: string
}

interface WorkflowRunData {
  id: number
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null
  status: 'completed' | 'in_progress' | 'queued' | 'waiting'
  createdAt: string
  updatedAt: string
  url: string
  runNumber: number
}

interface NightlyWorkflowStatus {
  config: NightlyWorkflowConfig
  latestRun: WorkflowRunData | null
  runs: WorkflowRunData[]
  trend7d: ('pass' | 'fail' | 'running' | 'none')[]
  passRate7d: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NIGHTLY_WORKFLOWS: NightlyWorkflowConfig[] = [
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-inference-scheduling.yaml', label: 'Inference Scheduling', platform: 'OpenShift', guide: 'inference-scheduling' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-inference-scheduling-gke.yaml', label: 'Inference Scheduling', platform: 'GKE', guide: 'inference-scheduling' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-pd-disaggregation.yaml', label: 'PD Disaggregation', platform: 'OpenShift', guide: 'pd-disaggregation' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-pd-disaggregation-gke.yaml', label: 'PD Disaggregation', platform: 'GKE', guide: 'pd-disaggregation' },
  { repo: 'llm-d/llm-d', workflowFile: 'nightly-e2e-precise-prefix-cache.yaml', label: 'Precise Prefix Cache', platform: 'OpenShift', guide: 'precise-prefix-cache' },
  { repo: 'llm-d/llm-d', workflowFile: 'e2e-wide-ep-accelerator-test.yaml', label: 'Wide EP', platform: 'Both', guide: 'wide-ep' },
  { repo: 'llm-d/llm-d-workload-variant-autoscaler', workflowFile: 'nightly-e2e-openshift.yaml', label: 'WVA', platform: 'OpenShift', guide: 'workload-autoscaling' },
  { repo: 'llm-d/llm-d-benchmark', workflowFile: 'ci-nighly-benchmark-ocp.yaml', label: 'Benchmark', platform: 'OpenShift', guide: 'benchmark' },
  { repo: 'llm-d/llm-d-benchmark', workflowFile: 'ci-nighly-benchmark-gke.yaml', label: 'Benchmark', platform: 'GKE', guide: 'benchmark' },
]

const PLATFORM_COLORS: Record<string, string> = {
  OpenShift: 'bg-red-500/20 text-red-400',
  GKE: 'bg-blue-500/20 text-blue-400',
  Both: 'bg-purple-500/20 text-purple-400',
}

const REPO_SHORT: Record<string, string> = {
  'llm-d/llm-d': 'llm-d',
  'llm-d/llm-d-workload-variant-autoscaler': 'wva',
  'llm-d/llm-d-benchmark': 'benchmark',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const decodeToken = (encoded: string): string => {
  try { return atob(encoded) } catch { return encoded }
}

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

function compute7DayTrend(runs: WorkflowRunData[]): ('pass' | 'fail' | 'running' | 'none')[] {
  const now = new Date()
  const trend: ('pass' | 'fail' | 'running' | 'none')[] = []

  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now)
    dayStart.setDate(dayStart.getDate() - i)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const dayRuns = runs.filter(r => {
      const t = new Date(r.createdAt)
      return t >= dayStart && t < dayEnd
    })

    if (dayRuns.length === 0) {
      trend.push('none')
    } else {
      const latest = dayRuns[0] // Runs are sorted newest-first from the API
      if (latest.status !== 'completed') {
        trend.push('running')
      } else if (latest.conclusion === 'success') {
        trend.push('pass')
      } else {
        trend.push('fail')
      }
    }
  }
  return trend
}

function compute7DayPassRate(runs: WorkflowRunData[]): number {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const recentRuns = runs.filter(r =>
    r.status === 'completed' && new Date(r.createdAt) >= sevenDaysAgo,
  )
  if (recentRuns.length === 0) return -1 // No data
  const passed = recentRuns.filter(r => r.conclusion === 'success').length
  return Math.round((passed / recentRuns.length) * 100)
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

function generateDemoData(): NightlyWorkflowStatus[] {
  const conclusions: ('success' | 'failure')[] = ['success', 'success', 'failure', 'success', 'success', 'success', 'success', 'success', 'failure']
  return NIGHTLY_WORKFLOWS.map((config, idx) => {
    const conclusion = conclusions[idx % conclusions.length]
    const runs: WorkflowRunData[] = Array.from({ length: 14 }, (_, i) => ({
      id: idx * 100 + i,
      conclusion: i === 0 ? conclusion : (Math.random() > 0.2 ? 'success' : 'failure'),
      status: 'completed' as const,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - i * 86400000 + 3600000).toISOString(),
      url: '#',
      runNumber: 100 - i,
    }))
    return {
      config,
      latestRun: runs[0],
      runs,
      trend7d: compute7DayTrend(runs),
      passRate7d: compute7DayPassRate(runs),
    }
  })
}

const DEMO_DATA = generateDemoData()

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NightlyE2EStatusProps {
  config?: Record<string, unknown>
}

export function NightlyE2EStatus({ config: _config }: NightlyE2EStatusProps) {
  const { data, isLoading, isFailed } = useCache<{ statuses: NightlyWorkflowStatus[], isDemo: boolean }>({
    key: 'nightly-e2e-status',
    category: 'default',
    initialData: { statuses: DEMO_DATA, isDemo: true },
    demoData: { statuses: DEMO_DATA, isDemo: true },
    persist: true,
    fetcher: async () => {
      const storedToken = localStorage.getItem('github_token')
      const token = storedToken ? decodeToken(storedToken) : null
      if (!token) return { statuses: DEMO_DATA, isDemo: true }

      const statuses: NightlyWorkflowStatus[] = []
      for (const wf of NIGHTLY_WORKFLOWS) {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${wf.repo}/actions/workflows/${wf.workflowFile}/runs?per_page=30`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } },
          )
          if (res.status === 401 || res.status === 403) {
            return { statuses: DEMO_DATA, isDemo: true }
          }
          if (!res.ok) {
            statuses.push({ config: wf, latestRun: null, runs: [], trend7d: Array(7).fill('none'), passRate7d: -1 })
            continue
          }
          const json = await res.json()
          const runs: WorkflowRunData[] = (json.workflow_runs || []).map((r: Record<string, unknown>) => ({
            id: r.id as number,
            conclusion: r.conclusion as WorkflowRunData['conclusion'],
            status: r.status as WorkflowRunData['status'],
            createdAt: r.created_at as string,
            updatedAt: r.updated_at as string,
            url: (r.html_url || '#') as string,
            runNumber: r.run_number as number,
          }))
          statuses.push({
            config: wf,
            latestRun: runs[0] || null,
            runs,
            trend7d: compute7DayTrend(runs),
            passRate7d: compute7DayPassRate(runs),
          })
        } catch {
          statuses.push({ config: wf, latestRun: null, runs: [], trend7d: Array(7).fill('none'), passRate7d: -1 })
        }
      }
      return { statuses, isDemo: false }
    },
  })

  const statuses = data.statuses
  const isDemo = data.isDemo

  useCardLoadingState({ isLoading, hasAnyData: statuses.length > 0 })

  // Aggregate stats
  const stats = useMemo(() => {
    const withRuns = statuses.filter(s => s.latestRun)
    const total = withRuns.length
    const passing = withRuns.filter(s => s.latestRun?.status === 'completed' && s.latestRun.conclusion === 'success').length
    const failing = withRuns.filter(s => s.latestRun?.status === 'completed' && s.latestRun.conclusion !== 'success').length
    const running = withRuns.filter(s => s.latestRun?.status === 'in_progress' || s.latestRun?.status === 'queued').length
    const noData = statuses.length - withRuns.length
    const passRate = total > 0 ? Math.round((passing / Math.max(passing + failing, 1)) * 100) : 0
    return { total: statuses.length, passing, failing, running, noData, passRate }
  }, [statuses])

  // Platform breakdown
  const platformStats = useMemo(() => {
    const ocp = statuses.filter(s => s.config.platform === 'OpenShift' || s.config.platform === 'Both')
    const gke = statuses.filter(s => s.config.platform === 'GKE' || s.config.platform === 'Both')
    const rate = (arr: NightlyWorkflowStatus[]) => {
      const completed = arr.filter(s => s.latestRun?.status === 'completed')
      if (completed.length === 0) return -1
      const passed = completed.filter(s => s.latestRun?.conclusion === 'success').length
      return Math.round((passed / completed.length) * 100)
    }
    return { ocpRate: rate(ocp), gkeRate: rate(gke) }
  }, [statuses])

  const overallHealth = stats.failing > 0 ? 'degraded' : stats.total === 0 ? 'unknown' : 'healthy'

  if (isLoading && statuses.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={200} height={20} />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="rounded" height={48} />)}
        </div>
        <Skeleton variant="rounded" height={200} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="rounded-lg bg-card/50 border border-border p-2.5 mb-3 flex items-center gap-2">
        <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
        <span className="text-sm font-medium text-foreground">Nightly E2E Report</span>
        <span className="text-xs text-muted-foreground">{statuses.length} workflows</span>
        <div className="ml-auto flex items-center gap-2">
          {/* Platform badges */}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
            OCP {platformStats.ocpRate >= 0 ? `${platformStats.ocpRate}%` : '—'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
            GKE {platformStats.gkeRate >= 0 ? `${platformStats.gkeRate}%` : '—'}
          </span>
          <span className={cn(
            'text-xs px-1.5 py-0.5 rounded',
            overallHealth === 'healthy' ? 'bg-green-500/20 text-green-400' :
            overallHealth === 'degraded' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-gray-500/20 text-gray-400',
          )}>
            {overallHealth}
          </span>
        </div>
      </div>

      {/* Demo indicator */}
      {isDemo && !isFailed && (
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

      {/* Stats grid */}
      <div className="grid grid-cols-5 gap-2 mb-3">
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className={cn('text-lg font-semibold', stats.passRate >= 80 ? 'text-green-400' : stats.passRate >= 50 ? 'text-yellow-400' : 'text-red-400')}>
            {stats.passRate}%
          </p>
          <p className="text-[10px] text-muted-foreground">Pass Rate</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-green-400">{stats.passing}</p>
          <p className="text-[10px] text-muted-foreground">Passing</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-red-400">{stats.failing}</p>
          <p className="text-[10px] text-muted-foreground">Failing</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-blue-400">{stats.running}</p>
          <p className="text-[10px] text-muted-foreground">Running</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-muted-foreground">{stats.total}</p>
          <p className="text-[10px] text-muted-foreground">Total</p>
        </div>
      </div>

      {/* Workflow table */}
      <div className="flex-1 overflow-y-auto">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_70px_60px_32px_112px_56px_40px_20px] gap-1 px-1.5 py-1 text-[10px] text-muted-foreground border-b border-border/50 mb-0.5">
          <span>Workflow</span>
          <span>Repo</span>
          <span>Platform</span>
          <span>St.</span>
          <span className="text-center">7-Day Trend</span>
          <span className="text-center">7d %</span>
          <span>When</span>
          <span />
        </div>

        {statuses.map((s, idx) => {
          const run = s.latestRun
          const isRunning = run?.status === 'in_progress' || run?.status === 'queued'
          const isPassing = run?.status === 'completed' && run.conclusion === 'success'
          const isFailing = run?.status === 'completed' && run.conclusion !== 'success' && run.conclusion !== null

          const StatusIcon = isPassing ? CheckCircle :
            isFailing ? XCircle :
            isRunning ? Loader2 :
            Clock

          return (
            <div
              key={idx}
              className="grid grid-cols-[1fr_70px_60px_32px_112px_56px_40px_20px] gap-1 items-center px-1.5 py-1 rounded hover:bg-card/30 transition-colors"
            >
              {/* Workflow name */}
              <span className="text-xs text-foreground truncate">{s.config.label}</span>

              {/* Repo badge */}
              <span className="text-[10px] px-1 py-0.5 rounded bg-card/80 text-muted-foreground truncate text-center">
                {REPO_SHORT[s.config.repo] || s.config.repo.split('/')[1]}
              </span>

              {/* Platform badge */}
              <span className={cn('text-[10px] px-1 py-0.5 rounded text-center', PLATFORM_COLORS[s.config.platform])}>
                {s.config.platform === 'OpenShift' ? 'OCP' : s.config.platform}
              </span>

              {/* Status icon */}
              <StatusIcon className={cn(
                'w-3.5 h-3.5',
                isPassing ? 'text-green-400' :
                isFailing ? 'text-red-400' :
                isRunning ? 'text-blue-400 animate-spin' :
                'text-muted-foreground',
              )} />

              {/* 7-day trend bar */}
              <div className="flex gap-0.5 items-center justify-center">
                {s.trend7d.map((day, di) => (
                  <div
                    key={di}
                    className={cn(
                      'w-3 h-4 rounded-sm',
                      day === 'pass' ? 'bg-green-500/60' :
                      day === 'fail' ? 'bg-red-500/60' :
                      day === 'running' ? 'bg-blue-500/60' :
                      'bg-gray-500/20',
                    )}
                    title={`${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][di] || `Day ${di + 1}`}: ${day}`}
                  />
                ))}
              </div>

              {/* 7-day pass rate */}
              <span className={cn(
                'text-[10px] text-center font-medium',
                s.passRate7d >= 80 ? 'text-green-400' :
                s.passRate7d >= 50 ? 'text-yellow-400' :
                s.passRate7d >= 0 ? 'text-red-400' :
                'text-muted-foreground',
              )}>
                {s.passRate7d >= 0 ? `${s.passRate7d}%` : '—'}
              </span>

              {/* Last run time */}
              <span className="text-[10px] text-muted-foreground truncate">
                {run ? formatTimeAgo(run.updatedAt) : '—'}
              </span>

              {/* Link */}
              {run && run.url !== '#' ? (
                <a
                  href={run.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-0.5 rounded hover:bg-secondary transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
              ) : (
                <span />
              )}
            </div>
          )
        })}
      </div>

      {/* Footer with failure callout */}
      {stats.failing > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400/70">
              {stats.failing} workflow{stats.failing > 1 ? 's' : ''} failing — check logs for details.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
