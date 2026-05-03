/**
 * UnifiedItemsList — Paginated flat-list view for offline detection card items.
 * Renders offline nodes, GPU issues, and predictions as individual rows.
 */
import { ChevronRight, RefreshCw, Cpu, HardDrive, Sparkles, Zap, ThumbsUp, ThumbsDown, CheckCircle } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { StatusBadge } from '../../ui/StatusBadge'
import { CardAIActions } from '../../../lib/cards/CardComponents'
import { useTranslation } from 'react-i18next'
import { TrendIcon } from './TrendIcon'
import type { UnifiedItem } from './offlineDataTransforms'
import type { TrendDirection } from '../../../types/predictions'

type UnifiedItemsListProps = {
  paginatedItems: UnifiedItem[]
  sortedItemsLength: number
  search: string
  localClusterFilter: string[]
  drillToNode: (cluster: string, name: string, extras: Record<string, unknown>) => void
  drillToCluster: (cluster: string) => void
  getFeedback: (id: string) => string | null
  submitFeedback: (id: string, feedback: string, type: string, provider?: string) => void
}

export function UnifiedItemsList({
  paginatedItems,
  sortedItemsLength,
  search,
  localClusterFilter,
  drillToNode,
  drillToCluster,
  getFeedback,
  submitFeedback,
}: UnifiedItemsListProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <>
      {paginatedItems.map((item) => {
        if (item.category === 'offline' && item.nodeData) {
          return (
            <OfflineNodeRow
              key={item.id}
              item={item}
              drillToNode={drillToNode}
              t={t as (key: string) => string}
            />
          )
        }

        if (item.category === 'gpu' && item.gpuData) {
          return (
            <GpuIssueRow
              key={item.id}
              item={item}
              drillToCluster={drillToCluster}
            />
          )
        }

        if (item.category === 'prediction' && item.predictionData) {
          return (
            <PredictionRow
              key={item.id}
              item={item}
              drillToCluster={drillToCluster}
              getFeedback={getFeedback}
              submitFeedback={submitFeedback}
            />
          )
        }

        return null
      })}

      {/* Empty state for list view */}
      {sortedItemsLength === 0 && (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-4" title="All nodes and GPUs healthy">
          <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
          {search || localClusterFilter.length > 0 ? 'No matching items' : 'All nodes & GPUs healthy'}
        </div>
      )}
    </>
  )
}

// ============================================================================
// Sub-row components
// ============================================================================

function OfflineNodeRow({
  item,
  drillToNode,
  t,
}: {
  item: UnifiedItem
  drillToNode: (cluster: string, name: string, extras: Record<string, unknown>) => void
  t: (key: string) => string
}) {
  const node = item.nodeData!
  const rootCause = item.rootCause

  return (
    <div
      className="p-2 rounded bg-red-500/10 text-xs cursor-pointer hover:bg-red-500/20 transition-colors group flex flex-wrap items-center justify-between gap-y-2"
      onClick={() => node.cluster && drillToNode(node.cluster, node.name, {
        status: node.unschedulable ? 'Cordoned' : node.status,
        unschedulable: node.unschedulable,
        roles: node.roles,
        issue: rootCause?.details || (node.unschedulable ? 'Node is cordoned and not accepting new workloads' : `Node status: ${node.status}`),
        rootCause: rootCause?.cause })}
      title={rootCause ? `${rootCause.cause}: ${rootCause.details}` : `Click to diagnose ${node.name}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-foreground truncate">{node.name}</span>
          <StatusBadge color="red" size="xs" className="shrink-0">
            {rootCause?.cause || t('cards:consoleOfflineDetection.offline')}
          </StatusBadge>
          {node.cluster && (
            <ClusterBadge cluster={node.cluster} size="sm" />
          )}
        </div>
        <div className="text-red-400 truncate mt-0.5">
          {rootCause?.details || (node.unschedulable ? t('common:common.cordoned') : node.status)}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <CardAIActions
          resource={{ kind: 'Node', name: node.name, cluster: node.cluster, status: node.unschedulable ? 'Cordoned' : node.status }}
          issues={rootCause ? [{ name: rootCause.cause, message: rootCause.details }] : []}
          className="opacity-0 group-hover:opacity-100"
        />
        <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </div>
    </div>
  )
}

function GpuIssueRow({
  item,
  drillToCluster,
}: {
  item: UnifiedItem
  drillToCluster: (cluster: string) => void
}) {
  const issue = item.gpuData!

  return (
    <div
      className="p-2 rounded bg-yellow-500/10 text-xs cursor-pointer hover:bg-yellow-500/20 transition-colors group flex flex-wrap items-center justify-between gap-y-2"
      onClick={() => drillToCluster(issue.cluster)}
      title={`Click to view cluster ${issue.cluster}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-foreground truncate">{issue.nodeName}</span>
          <StatusBadge color="yellow" size="xs" className="shrink-0">
            GPU
          </StatusBadge>
          <ClusterBadge cluster={issue.cluster} size="sm" />
        </div>
        <div className="text-yellow-400 truncate mt-0.5">0 GPUs available</div>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <CardAIActions
          resource={{ kind: 'GPU', name: issue.nodeName, cluster: issue.cluster, status: `${issue.available}/${issue.expected} GPUs available` }}
          issues={[{ name: 'GPU Unavailable', message: issue.reason }]}
          className="opacity-0 group-hover:opacity-100"
        />
        <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </div>
    </div>
  )
}

function PredictionRow({
  item,
  drillToCluster,
  getFeedback,
  submitFeedback,
}: {
  item: UnifiedItem
  drillToCluster: (cluster: string) => void
  getFeedback: (id: string) => string | null
  submitFeedback: (id: string, feedback: string, type: string, provider?: string) => void
}) {
  const risk = item.predictionData!
  const feedback = risk.id ? getFeedback(risk.id) : null

  return (
    <div
      className={cn(
        'p-2 rounded text-xs transition-colors group',
        'bg-blue-500/10 hover:bg-blue-500/20'
      )}
      title={risk.reasonDetailed || risk.reason}
    >
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div
          className="min-w-0 flex items-center gap-2 flex-1 cursor-pointer"
          onClick={() => risk.cluster && drillToCluster(risk.cluster)}
        >
          <PredictionTypeIcon type={risk.type} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-foreground truncate">{risk.name}</span>
              {risk.source === 'ai' ? (
                <StatusBadge color="blue" size="xs" className="shrink-0">
                  AI
                </StatusBadge>
              ) : (
                <StatusBadge color="blue" size="xs" className="shrink-0">
                  <Zap className="w-2 h-2" />
                </StatusBadge>
              )}
              {risk.confidence !== undefined && (
                <span className="text-[9px] text-muted-foreground">{risk.confidence}%</span>
              )}
              {risk.trend && <TrendIcon trend={risk.trend as TrendDirection} />}
              {risk.namespace && (
                <StatusBadge color="gray" size="xs" className="shrink-0 truncate max-w-[80px]" title={`namespace: ${risk.namespace}`}>
                  {risk.namespace}
                </StatusBadge>
              )}
              {risk.cluster && (
                <ClusterBadge cluster={risk.cluster} size="sm" />
              )}
            </div>
            <div className="truncate mt-0.5 text-blue-400">
              {risk.metric || risk.reason}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          <CardAIActions
            resource={{ kind: risk.type, name: risk.name, namespace: risk.namespace, cluster: risk.cluster, status: risk.severity }}
            issues={[{ name: risk.reason, message: risk.reasonDetailed || risk.reason }]}
            additionalContext={{ source: risk.source, confidence: risk.confidence, trend: risk.trend }}
            repairLabel="Prevent"
            className="opacity-0 group-hover:opacity-100"
          />
          {risk.source === 'ai' && risk.id && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  submitFeedback(risk.id, 'accurate', risk.type, risk.provider)
                }}
                className={cn(
                  'p-1 rounded transition-colors',
                  feedback === 'accurate'
                    ? 'bg-green-500/20 text-green-400'
                    : 'text-muted-foreground hover:text-green-400 hover:bg-green-500/10 opacity-0 group-hover:opacity-100'
                )}
                title="Mark as accurate"
              >
                <ThumbsUp className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  submitFeedback(risk.id, 'inaccurate', risk.type, risk.provider)
                }}
                className={cn(
                  'p-1 rounded transition-colors',
                  feedback === 'inaccurate'
                    ? 'bg-red-500/20 text-red-400'
                    : 'text-muted-foreground hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100'
                )}
                title="Mark as inaccurate"
              >
                <ThumbsDown className="w-3 h-3" />
              </button>
            </>
          )}
          <ChevronRight
            className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer"
            onClick={() => risk.cluster && drillToCluster(risk.cluster)}
          />
        </div>
      </div>
    </div>
  )
}

function PredictionTypeIcon({ type }: { type: string }) {
  if (type === 'pod-crash') {
    return <RefreshCw className="w-3 h-3 shrink-0 text-blue-400" />
  }
  if (type === 'resource-exhaustion') {
    return <Cpu className="w-3 h-3 shrink-0 text-blue-400" />
  }
  if (type === 'gpu-exhaustion') {
    return <HardDrive className="w-3 h-3 shrink-0 text-blue-400" />
  }
  return <Sparkles className="w-3 h-3 shrink-0 text-blue-400" />
}
