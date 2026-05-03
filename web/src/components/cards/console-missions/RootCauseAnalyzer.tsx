/**
 * RootCauseAnalyzer — Grouped view that shows items organized by root cause,
 * highlighting which single fixes can resolve multiple issues at once.
 */
import { ChevronRight, CheckCircle } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useTranslation } from 'react-i18next'
import type { UnifiedItem } from './offlineDataTransforms'

export type RootCauseGroup = {
  cause: string
  details: string
  items: UnifiedItem[]
  severity: 'critical' | 'warning' | 'info'
  categories: Set<string>
}

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
}

const SEVERITY_RGB: Record<string, string> = {
  red: '239,68,68',
  yellow: '234,179,8',
  blue: '59,130,246',
}

const SEVERITY_LIGHT_RGB: Record<string, string> = {
  red: '248,113,113',
  yellow: '250,204,21',
  blue: '96,165,250',
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
}: RootCauseAnalyzerProps) {
  const { t } = useTranslation(['cards', 'common'])

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
        const rgb = SEVERITY_RGB[severityColor] || SEVERITY_RGB.blue
        const lightRgb = SEVERITY_LIGHT_RGB[severityColor] || SEVERITY_LIGHT_RGB.blue

        return (
          <div key={group.cause} className="space-y-1">
            {/* Group Header */}
            <div
              className={cn(
                'p-2 rounded text-xs cursor-pointer transition-colors flex flex-wrap items-center justify-between gap-y-2',
                `bg-${severityColor}-500/10 hover:bg-${severityColor}-500/20 border border-${severityColor}-500/20`
              )}
              style={{
                backgroundColor: `rgba(${rgb}, 0.1)`,
                borderColor: `rgba(${rgb}, 0.2)`,
              }}
              onClick={() => toggleGroupExpand(group.cause)}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <ChevronRight
                  className={cn(
                    'w-3.5 h-3.5 shrink-0 transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                  style={{ color: `rgb(${lightRgb})` }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{group.cause}</span>
                    <span
                      className="px-1.5 py-0.5 text-2xs font-bold rounded"
                      style={{
                        backgroundColor: `rgba(${rgb}, 0.2)`,
                        color: `rgb(${lightRgb})`,
                      }}
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
                  const summary = group.items.map(item => `- ${item.name} (${item.cluster}): ${item.reason}`).join('\n')
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
