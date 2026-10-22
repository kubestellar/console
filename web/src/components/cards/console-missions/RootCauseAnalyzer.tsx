/**
 * RootCauseAnalyzer — Grouped view that shows items organized by root cause,
 * highlighting which single fixes can resolve multiple issues at once.
 *
 * Pure UI component — renders root cause groups based on props; no data fetching.
 * Accepts isDemoData prop to indicate when showing demo/fallback data.
 */
import { ChevronRight, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { Skeleton } from '../../ui/Skeleton'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useTranslation } from 'react-i18next'
import type { RootCauseGroup } from './offlineDataTransforms'

export type { RootCauseGroup } from './offlineDataTransforms'

type RootCauseAnalyzerProps = {
  rootCauseGroups: RootCauseGroup[]
  expandedGroups: Set<string>
  toggleGroupExpand: (cause: string) => void
  search: string
  localClusterFilter: string[]
  drillToNode: (cluster: string, name: string, extras: Record<string, unknown>) => void
  drillToCluster: (cluster: string) => void
  startMission: (config: {
    title: string
    description: string
    type: string
    initialPrompt: string
    context: Record<string, unknown>
  }) => void
  dataLoading?: boolean
  dataError?: string | null
  isDemoData?: boolean
}

// Static class names so Tailwind can detect them (dynamic `bg-${color}-500` is purged)
const SEVERITY_CLASSES: Record<string, { header: string; text: string; badge: string }> = {
  red: {
    header: 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20',
    text: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-500/20 text-red-600 dark:text-red-400',
  },
  yellow: {
    header: 'bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/20',
    text: 'text-yellow-600 dark:text-yellow-400',
    badge: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
  },
  blue: {
    header: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  },
}

function getSeverityColor(severity: string): string {
  if (severity === 'critical') return 'red'
  if (severity === 'warning') return 'yellow'
  return 'blue'
}

export function RootCauseAnalyzer({
  rootCauseGroups,
  expandedGroups,
  toggleGroupExpand,
  search,
  localClusterFilter,
  drillToNode,
  drillToCluster,
  startMission,
  dataLoading,
  dataError,
  isDemoData: _isDemoData,
}: RootCauseAnalyzerProps) {
  const { t } = useTranslation(['cards', 'common'])

  if (dataLoading) {
    return (
      <div className="space-y-2 py-2">
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-10 w-3/4 rounded" />
      </div>
    )
  }

  if (dataError) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
        <AlertCircle className="w-4 h-4 shrink-0" />
        {dataError}
      </div>
    )
  }

  if (rootCauseGroups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-4">
        <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
        {search || localClusterFilter.length > 0 ? t('common:common.noMatchingItems') : t('cards:consoleOfflineDetection.allHealthy')}
      </div>
    )
  }

  return (
    <>
      {rootCauseGroups.map((group) => {
        const isExpanded = expandedGroups.has(group.cause)
        const severityColor = getSeverityColor(group.severity)
        const severityClasses = SEVERITY_CLASSES[severityColor] || SEVERITY_CLASSES.blue

        return (
          <div key={group.cause} className="space-y-1">
            {/* Group Header */}
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
              className={cn(
                'p-2 rounded text-xs cursor-pointer transition-colors flex flex-wrap items-center justify-between gap-y-2',
                'border',
                severityClasses.header
              )}
              onClick={() => toggleGroupExpand(group.cause)}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <ChevronRight
                  className={cn(
                    'w-3.5 h-3.5 shrink-0 transition-transform',
                    severityClasses.text,
                    isExpanded && 'rotate-90'
                  )}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{group.cause}</span>
                    <span
                      className={cn('px-1.5 py-0.5 text-2xs font-bold rounded', severityClasses.badge)}
                    >
                      {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                    </span>
                    {group.items.length > 1 && (
                      <span className="text-2xs text-green-400 font-medium">
                        ✓ Fix once, solve {group.items.length}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground truncate mt-0.5">{group.details}</div>
                </div>
              </div>
              <button
                className={cn(
                  'px-2 py-1 text-2xs rounded font-medium transition-colors shrink-0 ml-2',
                  'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  const summary = (group.items || []).map(item => `- ${item.name} (${item.cluster}): ${item.reason}`).join('\n')
                  startMission({
                    title: `Diagnose: ${group.cause}`,
                    description: `Diagnosing ${group.items.length} items with root cause: ${group.cause}`,
                    type: 'troubleshoot',
                    initialPrompt: `You are diagnosing a Kubernetes cluster issue.

ROOT CAUSE: ${group.cause}
DETAILS: ${group.details}

AFFECTED ITEMS (${group.items.length}):
${summary}

TASK:
1. Explain why this root cause is affecting all these items
2. Provide a single fix that will resolve all ${group.items.length} items
3. List the specific commands or steps to remediate
4. Explain any risks and how to verify the fix worked`,
                    context: { rootCause: group.cause, affectedCount: group.items.length },
                  })
                }}
                title={`Diagnose all ${group.items.length} items with this root cause`}
              >
                Diagnose {group.items.length}
              </button>
            </div>

            {/* Expanded Items */}
            {isExpanded && (
              <div className="ml-4 space-y-1 border-l-2 border-border/50 pl-2">
                {group.items.map((item) => (
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
                    key={item.id}
                    className="p-1.5 rounded bg-secondary/30 text-xs cursor-pointer hover:bg-secondary/50 transition-colors flex flex-wrap items-center justify-between gap-y-2"
                    onClick={() => {
                      if (item.category === 'offline' && item.nodeData?.cluster) {
                        drillToNode(item.nodeData.cluster, item.name, {})
                      } else if (item.cluster) {
                        drillToCluster(item.cluster)
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-foreground truncate">{item.name}</span>
                      <ClusterBadge cluster={item.cluster} size="sm" />
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
