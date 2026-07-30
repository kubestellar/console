import { AlertTriangle, ChevronRight, Plus, RefreshCw, Trash2, Terminal } from 'lucide-react'
import type { TFunction } from 'i18next'
import { StatusIndicator, type Status } from '../charts/StatusIndicator'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { PortalTooltip } from '../cards/llmd/shared/PortalTooltip'
import { getClusterDisplayName } from '../../utils/clusterNames'
import type { AppSummary, DeploymentSummary, WorkloadItem } from './Workloads.types'

export const WORKLOAD_SKELETON_COUNT = 5

interface WorkloadsErrorBannerProps {
  error: string | null
  onRetry: () => void
  t: TFunction
}

export function WorkloadsErrorBanner({ error, onRetry, t }: WorkloadsErrorBannerProps) {
  if (!error) return null
  return (
    <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-400">{t('workloads.errorLoading', 'Could not load workload data')}</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/25"
          >
            {t('common.retry', 'Retry')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function WorkloadSkeletonList() {
  return (
    <div data-testid="workloads-loading-state" className="space-y-3">
      {Array.from({ length: WORKLOAD_SKELETON_COUNT }, (_, i) => (
        <div key={i} data-testid="workload-row-skeleton" className="glass p-4 rounded-lg border-l-4 border-l-gray-500/50">
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

interface WorkloadsEmptyStateProps {
  onDeploy: () => void
  t: TFunction
}

export function WorkloadsEmptyState({ onDeploy, t }: WorkloadsEmptyStateProps) {
  return (
    <div data-testid="workloads-empty-state" className="text-center py-12">
      <div className="text-6xl mb-4">📦</div>
      <p className="text-lg text-foreground">{t('workloads.noWorkloadsTitle', 'No workloads found')}</p>
      <p className="text-sm text-muted-foreground mb-6">{t('workloads.noWorkloadsDesc', 'No deployments detected across your clusters')}</p>
      <button
        data-testid="empty-state-deploy-workload-btn"
        onClick={onDeploy}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
      >
        <Plus className="w-4 h-4" />
        {t('workloads.deployWorkload', 'Create a Workload')}
      </button>
    </div>
  )
}

interface WorkloadRowProps {
  item: WorkloadItem
  onDrillToDeployment: (cluster: string, namespace: string, name: string) => void
  onDrillToNamespace: (cluster: string, namespace: string) => void
  onRestart: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => void
  onLogs: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => void
  onDelete: (e: React.MouseEvent, cluster: string, namespace: string, name: string) => void
  t: TFunction
}

export function WorkloadRow({ item, onDrillToDeployment, onDrillToNamespace, onRestart, onLogs, onDelete, t }: WorkloadRowProps) {
  const isDeployment = item.type === 'deployment'
  const app = item as AppSummary
  const deploy = item as DeploymentSummary

  const status = isDeployment
    ? (deploy.status === 'failed' ? 'error' : deploy.status === 'deploying' ? 'warning' : 'healthy')
    : app.status

  return (
    <div
      data-testid="workload-row"
      onClick={() => isDeployment
        ? onDrillToDeployment(deploy.cluster, deploy.namespace, deploy.name)
        : onDrillToNamespace(app.cluster, app.namespace)
      }
      className={`glass p-4 rounded-lg cursor-pointer transition-all hover:scale-[1.01] border-l-4 ${status === 'error' ? 'border-l-red-500' :
        status === 'warning' ? 'border-l-yellow-500' :
          'border-l-green-500'
        }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <StatusIndicator status={status as Status} size="lg" />
          <div>
            <h3 className="font-semibold text-foreground">{isDeployment ? deploy.name : app.namespace}</h3>
            <div className="flex items-center gap-2">
              <ClusterBadge cluster={getClusterDisplayName(item.cluster)} size="sm" />
              {isDeployment && <span className="text-xs text-muted-foreground">{deploy.namespace}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {isDeployment ? (
            <>
              <div className="text-center">
                <div className="text-lg font-bold text-foreground">{deploy.readyReplicas}/{deploy.replicas}</div>
                <div className="text-xs text-muted-foreground">{t('common.ready')}</div>
              </div>
              <div className="flex items-center gap-1">
                <PortalTooltip content={t('common.restart', 'Restart')}>
                  <button
                    data-testid="action-btn-restart"
                    onClick={(e) => onRestart(e, deploy.cluster, deploy.namespace, deploy.name)}
                    className="p-1.5 hover:bg-secondary/50 rounded-md text-muted-foreground hover:text-blue-400 transition-colors"
                    aria-label="Restart deployment"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </PortalTooltip>

                <PortalTooltip content={t('common.logs', 'Logs')}>
                  <button
                    data-testid="action-btn-logs"
                    onClick={(e) => onLogs(e, deploy.cluster, deploy.namespace, deploy.name)}
                    className="p-1.5 hover:bg-secondary/50 rounded-md text-muted-foreground hover:text-purple-400 transition-colors"
                    aria-label="View logs"
                  >
                    <Terminal className="w-4 h-4" />
                  </button>
                </PortalTooltip>

                <PortalTooltip content={t('common.delete', 'Delete')}>
                  <button
                    data-testid="action-btn-delete"
                    onClick={(e) => onDelete(e, deploy.cluster, deploy.namespace, deploy.name)}
                    className="p-1.5 hover:bg-secondary/50 rounded-md text-muted-foreground hover:text-red-400 transition-colors"
                    aria-label="Delete deployment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </PortalTooltip>
              </div>
            </>
          ) : (
            <>
              <div className="text-center">
                <div className="text-lg font-bold text-foreground">{app.deploymentCount}</div>
                <div className="text-xs text-muted-foreground">{t('common.deployments')}</div>
              </div>
              {app.deploymentIssues > 0 && (
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-400">{app.deploymentIssues}</div>
                  <div className="text-xs text-muted-foreground">Issues</div>
                </div>
              )}
              {app.podIssues > 0 && (
                <div className="text-center">
                  <div className="text-lg font-bold text-red-400">{app.podIssues}</div>
                  <div className="text-xs text-muted-foreground">Pod Issues</div>
                </div>
              )}
            </>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}

interface ClustersOverviewProps {
  clusters: Array<{ name: string; context?: string; reachable?: boolean; healthy?: boolean; podCount?: number; nodeCount?: number }>
  isAllClustersSelected: boolean
  globalSelectedClusters: string[]
  forceSkeletonForOffline: boolean
}

export function ClustersOverview({ clusters, isAllClustersSelected, globalSelectedClusters, forceSkeletonForOffline }: ClustersOverviewProps) {
  return (
    <div data-testid="clusters-overview-section" className="mt-8">
      <h2 data-testid="clusters-overview-heading" className="text-lg font-semibold text-foreground mb-4">Clusters Overview</h2>
      <div data-testid="clusters-overview-grid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {forceSkeletonForOffline ? (
          Array.from({ length: WORKLOAD_SKELETON_COUNT }, (_, i) => (
            <div key={i} className="glass p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Skeleton variant="circular" width={16} height={16} />
                <Skeleton variant="text" width={100} height={16} />
              </div>
              <Skeleton variant="text" width={80} height={12} />
            </div>
          ))
        ) : (
          clusters
            .filter(cluster => isAllClustersSelected || globalSelectedClusters.includes(cluster.name))
            .map((cluster) => (
              <div key={cluster.name} data-testid="cluster-card" className="glass p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <StatusIndicator
                    status={cluster.reachable === false ? 'unreachable' : cluster.healthy ? 'healthy' : 'error'}
                    size="sm"
                  />
                  <span className="font-medium text-foreground text-sm truncate">
                    {cluster.context || getClusterDisplayName(cluster.name)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {cluster.reachable !== false ? (cluster.podCount ?? '-') : '-'} pods • {cluster.reachable !== false ? (cluster.nodeCount ?? '-') : '-'} nodes
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
