/**
 * MiniDashboard.parts – presentational subcomponents for the MiniDashboard widget.
 *
 * Contains:
 *   StatCard      — single stat tile renderer
 *   StatusDot     — animated health status indicator
 *   StatsGrid     — 3-column grid of six StatCard tiles
 *   IssuesList    — scrollable list of recent pod issues (empty-state: renders nothing)
 *   DashboardHeader — top bar with title, status dot, refresh button, expand button
 *   InstallFooter — bottom bar with PWA install prompt / installed state
 */

import { RefreshCw, Maximize2, Download } from 'lucide-react'
import type { TFunction } from 'i18next'
import type { PodIssue } from '../../hooks/useMCP'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import type { NodeData, BeforeInstallPromptEvent } from './useMiniDashboard'
import { MAX_ISSUES_SHOWN } from './useMiniDashboard'

// ---------------------------------------------------------------------------
// StatCard — tile renderer
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string
  value: string | number
  color: string
  subValue?: string
}

export function StatCard({ label, value, color, subValue }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-3 rounded-lg',
        'bg-secondary/50 border border-border/50'
      )}
    >
      <span className={cn('text-2xl font-bold', color)}>{value}</span>
      <span className="text-xs text-muted-foreground mt-1">{label}</span>
      {subValue && <span className="text-2xs text-muted-foreground">{subValue}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatusDot — animated health indicator
// ---------------------------------------------------------------------------

interface StatusDotProps {
  status: 'healthy' | 'warning' | 'error'
}

const STATUS_DOT_COLORS: Record<StatusDotProps['status'], string> = {
  healthy: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
}

export function StatusDot({ status }: StatusDotProps) {
  return (
    <span
      className={cn('w-2 h-2 rounded-full inline-block animate-pulse', STATUS_DOT_COLORS[status])}
    />
  )
}

// ---------------------------------------------------------------------------
// StatsGrid — tile grid (3 columns × 2 rows = 6 stat tiles)
// ---------------------------------------------------------------------------

interface StatsGridProps {
  totalClusters: number
  healthyClusters: number
  allocatedGPUs: number
  totalGPUs: number
  offlineCount: number
  totalIssues: number
  criticalIssues: number
  allNodes: NodeData[]
  overallStatus: 'healthy' | 'warning' | 'error'
}

export function StatsGrid({
  totalClusters,
  healthyClusters,
  allocatedGPUs,
  totalGPUs,
  offlineCount,
  totalIssues,
  criticalIssues,
  allNodes,
  overallStatus,
}: StatsGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      <StatCard
        label="Clusters"
        value={totalClusters}
        color="text-purple-400"
        subValue={`${healthyClusters} healthy`}
      />
      <StatCard
        label="GPUs"
        value={`${allocatedGPUs}/${totalGPUs}`}
        color="text-green-400"
        subValue="allocated/total"
      />
      <StatCard
        label="Nodes Offline"
        value={offlineCount}
        color={offlineCount > 0 ? 'text-red-400' : 'text-green-400'}
        subValue={offlineCount > 0 ? 'needs attention' : 'all online'}
      />
      <StatCard
        label="Pod Issues"
        value={totalIssues}
        color={totalIssues > 0 ? 'text-orange-400' : 'text-muted-foreground'}
        subValue={criticalIssues > 0 ? `${criticalIssues} critical` : undefined}
      />
      <StatCard
        label="Nodes"
        value={allNodes.length}
        color="text-blue-400"
        subValue={`${allNodes.length - offlineCount} ready`}
      />
      <StatCard
        label="Status"
        value={overallStatus === 'healthy' ? 'OK' : overallStatus === 'warning' ? 'Warn' : 'Alert'}
        color={
          overallStatus === 'healthy'
            ? 'text-green-400'
            : overallStatus === 'warning'
            ? 'text-yellow-400'
            : 'text-red-400'
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// IssuesList — recent pod issues (renders nothing when totalIssues === 0)
// ---------------------------------------------------------------------------

interface IssuesListProps {
  totalIssues: number
  podIssues: PodIssue[] | undefined
  onOpenIssue: (podName: string) => void
}

export function IssuesList({ totalIssues, podIssues, onOpenIssue }: IssuesListProps) {
  if (totalIssues === 0) return null

  return (
    <div className="mb-4">
      <h2 className="text-xs font-medium text-muted-foreground mb-2">Recent Issues</h2>
      <div className="space-y-1 max-h-32 overflow-hidden">
        {(podIssues || []).slice(0, MAX_ISSUES_SHOWN).map((issue, i) => {
          const isCritical =
            issue.status === 'CrashLoopBackOff' ||
            issue.status === 'OOMKilled' ||
            issue.status === 'Error'
          return (
            <Button
              key={i}
              onClick={() => onOpenIssue(issue.name)}
              variant="secondary"
              size="sm"
              fullWidth
              className="justify-start border border-border/30 hover:border-border"
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  isCritical ? 'bg-red-500' : 'bg-orange-500'
                )}
              />
              <span className="truncate text-foreground">{issue.name}</span>
              <span className="text-muted-foreground ml-auto shrink-0">
                {issue.reason || issue.status}
              </span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DashboardHeader — top bar
// ---------------------------------------------------------------------------

interface DashboardHeaderProps {
  overallStatus: 'healthy' | 'warning' | 'error'
  lastUpdated: Date | null
  isRefreshing: boolean
  onRefresh: () => void
  onOpenFullDashboard: () => void
  t: TFunction
}

export function DashboardHeader({
  overallStatus,
  lastUpdated,
  isRefreshing,
  onRefresh,
  onOpenFullDashboard,
  t,
}: DashboardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <StatusDot status={overallStatus} />
        <h1 className="text-lg font-semibold">Nodes</h1>
      </div>
      <div className="flex items-center gap-2">
        {lastUpdated && (
          <span className="text-xs text-muted-foreground">{lastUpdated.toLocaleTimeString()}</span>
        )}
        <Button
          onClick={onRefresh}
          disabled={isRefreshing}
          variant="ghost"
          size="sm"
          icon={<RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />}
          title={t('common.refresh')}
          aria-label={t('common.refresh')}
        />
        <Button
          onClick={onOpenFullDashboard}
          variant="ghost"
          size="sm"
          icon={<Maximize2 className="w-4 h-4" />}
          title="Open full dashboard"
          aria-label="Open full dashboard"
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InstallFooter — bottom bar with install prompt / installed state
// ---------------------------------------------------------------------------

interface InstallFooterProps {
  isInstalled: boolean
  isSafariBrowser: boolean
  installPrompt: BeforeInstallPromptEvent | null
  onInstall: () => void
  onOpenFullDashboard: () => void
  t: TFunction
}

export function InstallFooter({
  isInstalled,
  isSafariBrowser,
  installPrompt,
  onInstall,
  onOpenFullDashboard,
  t,
}: InstallFooterProps) {
  if (!isInstalled && installPrompt) {
    return (
      <Button
        onClick={onInstall}
        variant="accent"
        size="md"
        fullWidth
        icon={<Download className="w-4 h-4" />}
      >
        Install as Desktop Widget
      </Button>
    )
  }

  if (!isInstalled) {
    return (
      <div className="text-center text-xs text-muted-foreground space-y-1">
        {isSafariBrowser ? (
          <div>{t('miniDashboard.safariInstall')}</div>
        ) : (
          <>
            <div className="text-yellow-500/80">⚠️ {t('miniDashboard.installFromThisPage')}</div>
            <div>{t('miniDashboard.installInstruction')}</div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{t('miniDashboard.nodesWidget')}</span>
      <Button
        onClick={onOpenFullDashboard}
        variant="ghost"
        size="sm"
        icon={<Maximize2 className="w-3 h-3" />}
        className="h-auto p-0"
      >
        {t('miniDashboard.openFullDashboard')}
      </Button>
    </div>
  )
}
