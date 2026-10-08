import { CheckCircle, WifiOff, Cpu, Loader2, ExternalLink, AlertTriangle, KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ClusterInfo } from '../../hooks/useMCP'
import { CardAIActions } from '../../lib/cards/CardComponents'
import { CloudProviderIcon, detectCloudProvider, getProviderLabel, getConsoleUrl, CloudProvider } from '../ui/CloudProviderIcon'
import { isClusterUnreachable, isClusterTokenExpired, isClusterHealthy } from '../clusters/utils'
import { getProviderLabel as getFederationProviderLabel, getStateLabel, getStateColorClasses, type FederatedCluster } from '../../hooks/useFederation'
import { Tooltip } from '../ui/Tooltip'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'

interface ClusterHealthRowProps {
  cluster: ClusterInfo
  idx: number
  canOpenClusterDetails: boolean
  isMobile: boolean
  federationClusters: FederatedCluster[]
  gpuCount: number | undefined
  onSelect: (clusterName: string) => void
}

/** A single cluster row in the ClusterHealth card list. */
export function ClusterHealthRow({
  cluster,
  idx,
  canOpenClusterDetails,
  isMobile,
  federationClusters,
  gpuCount,
  onSelect,
}: ClusterHealthRowProps) {
  const { t } = useTranslation(['cards', 'common'])

  const clusterUnreachable = isClusterUnreachable(cluster)
  const clusterTokenExpired = isClusterTokenExpired(cluster)
  const clusterHealthy = !clusterUnreachable && isClusterHealthy(cluster)
  // Only show loading spinner for initial load (health never checked, not unreachable)
  const clusterLoading = !clusterUnreachable && cluster.healthy === undefined
  // Use detected distribution from health check, or detect from name/server/namespaces
  const provider = cluster.distribution as CloudProvider ||
    detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
  const providerLabel = getProviderLabel(provider)
  const consoleUrl = getConsoleUrl(provider, cluster.name, cluster.server)
  const statusTooltip = clusterLoading
    ? t('clusterHealth.checkingHealth')
    : cluster.healthy
      ? t('clusterHealth.clusterHealthy', { nodes: cluster.nodeCount || 0, pods: cluster.podCount || 0 })
      : clusterTokenExpired
        ? t('clusterHealth.tokenExpired')
        : clusterUnreachable
          ? t('clusterHealth.offlineCheckNetwork')
          : cluster.errorMessage || t('clusterHealth.clusterHasIssues')
  return (
    <Tooltip
      content={canOpenClusterDetails ? t('clusterHealth.clickViewDetails', { name: cluster.name }) : statusTooltip}
      wrapperClassName="block w-full"
    >
    <div
      data-tour={idx === 0 && canOpenClusterDetails ? 'drilldown' : undefined}
      className={`group w-full ${isMobile ? 'flex flex-col gap-2' : 'flex flex-wrap items-start justify-between gap-x-4 gap-y-3'} p-3 rounded-lg border border-border/30 bg-secondary/30 transition-all ${canOpenClusterDetails ? 'cursor-pointer hover:bg-secondary/50 hover:border-border/50' : 'cursor-default'} min-w-0 overflow-hidden`}
      role={canOpenClusterDetails ? 'button' : undefined}
      tabIndex={canOpenClusterDetails ? 0 : undefined}
      onClick={canOpenClusterDetails ? () => onSelect(cluster.name) : undefined}
      onKeyDown={canOpenClusterDetails ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(cluster.name) } } : undefined}
      aria-label={canOpenClusterDetails ? t('clusterHealth.clickViewDetails', { name: cluster.name }) : undefined}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1 flex-wrap" title={statusTooltip}>
        {/* Status icon: green check for healthy, red key for auth error, yellow wifi-off for offline, red triangle for degraded */}
        {clusterLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
        ) : clusterTokenExpired ? (
          <KeyRound className="w-3.5 h-3.5 text-red-400 shrink-0" />
        ) : clusterUnreachable ? (
          <WifiOff className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        ) : clusterHealthy ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        )}
        <span title={providerLabel} className="shrink-0">
          <CloudProviderIcon provider={provider} size={14} />
        </span>
        <span className="text-sm text-foreground truncate">{cluster.name}</span>
        {(() => {
          const pills = (federationClusters || []).filter(
            (fc: FederatedCluster) => fc.name === cluster.name || (cluster.server && fc.apiServerURL === cluster.server)
          )
          if (pills.length === 0) return null
          return pills.map((fc: FederatedCluster) => (
            <span
              key={`${fc.provider}-${fc.hubContext}`}
              className={`inline-flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded border shrink-0 ${getStateColorClasses(fc.state)}`}
              title={`${getFederationProviderLabel(fc.provider)} [${fc.hubContext}]: ${getStateLabel(fc.state)}`}
            >
              {getFederationProviderLabel(fc.provider)}:{getStateLabel(fc.state)}
            </span>
          ))
        })()}
        {/* Warn when cluster is internally reachable but API server is externally unreachable (#4202) */}
        {!clusterUnreachable && !clusterLoading && cluster.externallyReachable === false && (
          <span
            className="flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 shrink-0"
            title="API server externally unreachable — cluster healthy internally but external access may be blocked"
          >
            <WifiOff className="w-3 h-3" />
            <span className="hidden @sm:inline">ext. unreachable</span>
          </span>
        )}
        {consoleUrl && (
          <a
            href={sanitizeUrl(consoleUrl)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-0.5 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
            title={`Open ${providerLabel} console`}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <div className={`flex items-center ${isMobile ? 'gap-3 pl-6 flex-wrap' : 'gap-4 shrink-0 flex-wrap justify-end'} text-xs text-muted-foreground min-w-0 overflow-hidden`}>
        <span className="whitespace-nowrap" title={clusterLoading ? t('common:common.checking') : !clusterUnreachable ? t('clusterHealth.nodesInCluster', { count: cluster.nodeCount || 0 }) : t('clusterHealth.offlineCheckNetwork')}>
          {clusterLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : !clusterUnreachable ? (cluster.nodeCount || 0) : '-'} {t('common:common.nodes').toLowerCase()}
        </span>
        {!clusterLoading && !clusterUnreachable && (cluster.cpuCores || 0) > 0 && (
          <span className="whitespace-nowrap" title={t('clusterHealth.totalCpuCores', { count: cluster.cpuCores })}>{cluster.cpuCores} {t('common:common.cpus')}</span>
        )}
        <span className="whitespace-nowrap" title={clusterLoading ? t('common:common.checking') : !clusterUnreachable ? t('clusterHealth.podsRunning', { count: cluster.podCount || 0 }) : t('clusterHealth.offlineCheckNetwork')}>
          {clusterLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : !clusterUnreachable ? (cluster.podCount || 0) : '-'} {t('common:common.pods').toLowerCase()}
        </span>
        {!clusterLoading && !clusterUnreachable && (gpuCount || 0) > 0 && (
          <span className="flex items-center gap-1 text-purple-400 whitespace-nowrap" title={t('clusterHealth.gpusAvailable', { count: gpuCount })}>
            <Cpu className="w-3 h-3 shrink-0" />
            {gpuCount} {t('common:common.gpus')}
          </span>
        )}
        {/* AI Diagnose & Repair for unhealthy/offline clusters */}
        {!clusterLoading && (clusterUnreachable || !clusterHealthy) && (
          <CardAIActions
            resource={{
              kind: 'Cluster',
              name: cluster.name,
              status: clusterTokenExpired ? 'TokenExpired' : clusterUnreachable ? 'Unreachable' : 'Unhealthy' }}
            issues={[{
              name: clusterTokenExpired ? 'Auth Error' : clusterUnreachable ? 'Unreachable' : 'Unhealthy',
              message: cluster.errorMessage || (clusterTokenExpired ? 'Token expired' : 'Cluster health check failed') }]}
            additionalContext={{ nodeCount: cluster.nodeCount, podCount: cluster.podCount, server: cluster.server }}
          />
        )}
      </div>
    </div>
    </Tooltip>
  )
}
