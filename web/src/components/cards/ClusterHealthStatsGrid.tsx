import { CheckCircle, WifiOff, AlertTriangle, KeyRound, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getProviderLabel as getFederationProviderLabel, type FederatedCluster, type ProviderHubStatus } from '../../hooks/useFederation'
import { CardStatGrid, CardStatHeader } from '../../lib/cards/CardComponents'

interface ClusterHealthStatsGridProps {
  healthyClusters: number
  unhealthyClusters: number
  tokenExpiredClusters: number
  networkOfflineClusters: number
  federationHubs: ProviderHubStatus[]
  federationClusters: FederatedCluster[]
}

/** Health summary tiles (healthy / unhealthy / auth error / offline / federation hubs) for the ClusterHealth card. */
export function ClusterHealthStatsGrid({
  healthyClusters,
  unhealthyClusters,
  tokenExpiredClusters,
  networkOfflineClusters,
  federationHubs,
  federationClusters,
}: ClusterHealthStatsGridProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <CardStatGrid className="@md:grid-cols-4 gap-2">
      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 min-w-0 overflow-hidden" title={t('clusterHealth.healthyTooltip', { count: healthyClusters })}>
        <CardStatHeader className="gap-1.5 min-w-0">
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          <span className="text-xs text-green-400 truncate">{t('common:common.healthy')}</span>
        </CardStatHeader>
        <span className="text-2xl font-bold text-foreground">{healthyClusters}</span>
      </div>
      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 min-w-0 overflow-hidden" title={t('clusterHealth.unhealthyTooltip', { count: unhealthyClusters })}>
        <CardStatHeader className="gap-1.5 min-w-0">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-400 truncate">{t('common:common.unhealthy')}</span>
        </CardStatHeader>
        <span className="text-2xl font-bold text-foreground">{unhealthyClusters}</span>
      </div>
      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 min-w-0 overflow-hidden" title={t('clusterHealth.authErrorTooltip', { count: tokenExpiredClusters })}>
        <CardStatHeader className="gap-1.5 min-w-0">
          <KeyRound className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-400 truncate">{t('clusterHealth.authErrorLabel')}</span>
        </CardStatHeader>
        <span className="text-2xl font-bold text-foreground">{tokenExpiredClusters}</span>
      </div>
      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 min-w-0 overflow-hidden" title={t('clusterHealth.offlineTooltip', { count: networkOfflineClusters })}>
        <CardStatHeader className="gap-1.5 min-w-0">
          <WifiOff className="w-4 h-4 text-yellow-400 shrink-0" />
          <span className="text-xs text-yellow-400 truncate">{t('common:common.offline')}</span>
        </CardStatHeader>
        <span className="text-2xl font-bold text-foreground">{networkOfflineClusters}</span>
      </div>
      {(federationHubs || []).filter(h => h.detected).map(hub => {
        const hubClusters = (federationClusters || []).filter(
          fc => fc.provider === hub.provider && fc.hubContext === hub.hubContext
        )
        const joinedCount = hubClusters.filter(fc => fc.state === 'joined' || fc.state === 'provisioned').length
        return (
          <div
            key={`${hub.provider}-${hub.hubContext}`}
            className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 min-w-0 overflow-hidden"
            title={`${getFederationProviderLabel(hub.provider)} hub: ${hub.hubContext} — ${joinedCount}/${hubClusters.length} clusters active`}
          >
            <CardStatHeader className="gap-1.5 min-w-0">
              <Server className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-xs text-blue-400 truncate">{getFederationProviderLabel(hub.provider)}</span>
            </CardStatHeader>
            <span className="text-2xl font-bold text-foreground">{hubClusters.length}</span>
            <span className="text-xs text-muted-foreground ml-1">{t('clusterHealth.clustersLabel').toLowerCase()}</span>
          </div>
        )
      })}
    </CardStatGrid>
  )
}
