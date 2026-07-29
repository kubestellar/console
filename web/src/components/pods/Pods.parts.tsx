import { ChevronRight, RefreshCw, Terminal, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusIndicator } from '../charts/StatusIndicator'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { TechnicalAcronym, STATUS_TOOLTIPS } from '../shared/TechnicalAcronym'
import { PortalTooltip } from '../cards/llmd/shared/PortalTooltip'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../../lib/modals/ConfirmDialog'
import { cn } from '../../lib/cn'
import type { PodIssue } from '../../hooks/mcp/types.workloads'
import type { ClusterInfo } from '../../hooks/mcp/types'

const SKELETON_ROW_COUNT = 5

export function PodsSkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
        <div key={i} className="glass p-4 rounded-lg border-l-4 border-l-gray-500/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton variant="circular" width={24} height={24} />
              <div>
                <Skeleton variant="text" width={150} height={20} className="mb-1" />
                <Skeleton variant="rounded" width={80} height={18} />
              </div>
            </div>
            <Skeleton variant="text" width={100} height={20} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PodsEmptyState() {
  const { t } = useTranslation()
  return (
    <div className="text-center py-12">
      <div className="text-6xl mb-4">🎉</div>
      <div className="text-lg text-foreground">{t('pods.noPodIssues', 'No Pod Issues')}</div>
      <div className="text-sm text-muted-foreground">All pods are running healthy across your clusters</div>
    </div>
  )
}

interface PodIssueRowProps {
  issue: PodIssue
  backendActionUnavailable: boolean
  backendUnavailableMessage: string
  onDrillToPod: (cluster: string, namespace: string, name: string, data: Record<string, unknown>) => void
  onKeyDown: (
    e: React.KeyboardEvent,
    cluster: string | undefined,
    namespace: string,
    name: string,
    data: Record<string, unknown>,
  ) => void
  onShowLogs: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => void
  onRestart: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => void
  onDelete: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => void
}

export function PodIssueRow({
  issue,
  backendActionUnavailable,
  backendUnavailableMessage,
  onDrillToPod,
  onKeyDown,
  onShowLogs,
  onRestart,
  onDelete,
}: PodIssueRowProps) {
  const { t } = useTranslation()
  const isCritical = issue.reason === 'CrashLoopBackOff' || issue.reason === 'OOMKilled'
  const isPending = issue.reason === 'Pending' || issue.reason === 'ContainerCreating'
  const status = isCritical ? 'error' : 'warning'

  return (
    <div
      onClick={() => issue.cluster && onDrillToPod(issue.cluster, issue.namespace, issue.name, { ...issue })}
      onKeyDown={(e) => onKeyDown(e, issue.cluster, issue.namespace, issue.name, { ...issue })}
      role="button"
      tabIndex={issue.cluster ? 0 : -1}
      aria-disabled={!issue.cluster || undefined}
      aria-label={`View pod issue: ${issue.name} in ${issue.namespace}${issue.cluster ? ` on ${issue.cluster.split('/').pop() || issue.cluster}` : ''}`}
      className={cn(
        'glass p-4 rounded-lg transition-all border-l-4',
        issue.cluster ? 'cursor-pointer hover:scale-[1.01]' : 'cursor-default',
        isCritical ? 'border-l-red-500' : isPending ? 'border-l-yellow-500' : 'border-l-orange-500',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PortalTooltip content={STATUS_TOOLTIPS[status]}>
            <span>
              <StatusIndicator status={status} size="lg" />
            </span>
          </PortalTooltip>
          <div>
            <h3 className="font-semibold text-foreground">{issue.name}</h3>
            <div className="flex items-center gap-2">
              <ClusterBadge cluster={issue.cluster?.split('/').pop() || 'unknown'} size="sm" />
              <span className="text-xs text-muted-foreground">{issue.namespace}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-sm font-medium text-orange-400">
              {isCritical ? (
                <TechnicalAcronym term={issue.reason!}>{issue.reason}</TechnicalAcronym>
              ) : (
                issue.reason || 'Unknown'
              )}
            </div>
            <div className="text-xs text-muted-foreground">{issue.status || 'Unknown status'}</div>
          </div>

          {(issue.restarts || 0) > 0 && (
            <div className="text-center">
              <div className="text-lg font-bold text-red-400">{issue.restarts}</div>
              <div className="text-xs text-muted-foreground">{t('pods.restarts', 'Restarts')}</div>
            </div>
          )}

          <div className="flex items-center gap-1">
            <PortalTooltip content={backendActionUnavailable ? backendUnavailableMessage : t('common.restart', 'Restart')}>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => issue.cluster && onRestart(e, issue.cluster, issue.namespace, issue.name)}
                disabled={backendActionUnavailable}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 hover:text-blue-400 dark:hover:bg-white/10"
                aria-label={t('common.restart', 'Restart')}
                title={backendActionUnavailable ? backendUnavailableMessage : t('common.restart', 'Restart')}
                icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
              />
            </PortalTooltip>

            <PortalTooltip content={t('common.logs', 'Logs')}>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => issue.cluster && onShowLogs(e, issue.cluster, issue.namespace, issue.name)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 hover:text-purple-400 dark:hover:bg-white/10"
                aria-label={t('common.logs', 'Logs')}
                title={t('common.logs', 'Logs')}
                icon={<Terminal className="w-4 h-4" aria-hidden="true" />}
              />
            </PortalTooltip>

            <PortalTooltip content={backendActionUnavailable ? backendUnavailableMessage : t('common.delete', 'Delete')}>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => issue.cluster && onDelete(e, issue.cluster, issue.namespace, issue.name)}
                disabled={backendActionUnavailable}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 hover:text-red-400 dark:hover:bg-white/10"
                aria-label={t('common.delete', 'Delete')}
                title={backendActionUnavailable ? backendUnavailableMessage : t('common.delete', 'Delete')}
                icon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
              />
            </PortalTooltip>
          </div>

          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}

interface PodIssuesListProps {
  issues: PodIssue[]
  backendActionUnavailable: boolean
  backendUnavailableMessage: string
  onDrillToPod: (cluster: string, namespace: string, name: string, data: Record<string, unknown>) => void
  onKeyDown: (
    e: React.KeyboardEvent,
    cluster: string | undefined,
    namespace: string,
    name: string,
    data: Record<string, unknown>,
  ) => void
  onShowLogs: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => void
  onRestart: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => void
  onDelete: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => void
}

export function PodIssuesList({ issues, ...rowProps }: PodIssuesListProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground mb-4">Pod Issues ({issues.length})</h2>
      {issues.map((issue, i) => (
        <PodIssueRow key={i} issue={issue} {...rowProps} />
      ))}
    </div>
  )
}

interface ClustersOverviewProps {
  clusters: ClusterInfo[]
  isAllClustersSelected: boolean
  globalSelectedClusters: string[]
}

export function ClustersOverview({ clusters, isAllClustersSelected, globalSelectedClusters }: ClustersOverviewProps) {
  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-foreground mb-4">Clusters Overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {clusters
          .filter(cluster => isAllClustersSelected || globalSelectedClusters.includes(cluster.name))
          .map((cluster) => {
            const clusterStatus = cluster.reachable === false ? 'unreachable' : cluster.healthy ? 'healthy' : 'error'
            return (
              <div key={cluster.name} className="glass p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <PortalTooltip content={STATUS_TOOLTIPS[clusterStatus]}>
                    <span>
                      <StatusIndicator status={clusterStatus} size="sm" />
                    </span>
                  </PortalTooltip>
                  <span className="font-medium text-foreground text-sm truncate">
                    {cluster.context || cluster.name.split('/').pop()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {cluster.reachable !== false ? (cluster.podCount ?? '-') : '-'} pods
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

interface PodDeleteDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  podName: string
  isLoading: boolean
}

export function PodDeleteDialog({ isOpen, onClose, onConfirm, podName, isLoading }: PodDeleteDialogProps) {
  const { t } = useTranslation()
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t('pods.confirmDeleteTitle', 'Delete Pod')}
      message={t(
        'pods.confirmDeleteMessage',
        'Are you sure you want to delete pod {{name}}? This action cannot be undone.',
        { name: podName },
      )}
      confirmLabel={t('common.delete', 'Delete')}
      cancelLabel={t('common.cancel', 'Cancel')}
      variant="danger"
      isLoading={isLoading}
    />
  )
}
