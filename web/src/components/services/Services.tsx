import { useCallback } from 'react'
import { AlertCircle } from 'lucide-react'
import { useClusters, useServices } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'

const SERVICES_CARDS_KEY = 'kubestellar-services-cards'

// Default cards for the services dashboard
const DEFAULT_SERVICES_CARDS = getDefaultCards('services')

export function Services() {
  const { clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error: clustersError } = useClusters()
  const { services, error: servicesError } = useServices()
  const error = clustersError || servicesError

  const { drillToAllServices, drillToAllClusters } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Filter services by selected clusters
  const filteredServices = services.filter(s =>
    isAllClustersSelected || globalSelectedClusters.includes(s.cluster || '')
  )

  // Calculate service stats
  const totalServices = filteredServices.length
  const loadBalancers = filteredServices.filter(s => s.type === 'LoadBalancer').length
  const nodePortServices = filteredServices.filter(s => s.type === 'NodePort').length
  const clusterIPServices = filteredServices.filter(s => s.type === 'ClusterIP').length

  // Stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', onClick: () => drillToAllClusters(), isClickable: reachableClusters.length > 0 }
      case 'healthy':
        return { value: reachableClusters.length, sublabel: 'with services', onClick: () => drillToAllClusters(), isClickable: reachableClusters.length > 0 }
      case 'services':
        return { value: totalServices, sublabel: 'total services', onClick: () => drillToAllServices(), isClickable: totalServices > 0 }
      case 'loadbalancers':
        return { value: loadBalancers, sublabel: 'load balancers', onClick: () => drillToAllServices('loadbalancer'), isClickable: loadBalancers > 0 }
      case 'nodeport':
        return { value: nodePortServices, sublabel: 'NodePort', onClick: () => drillToAllServices('nodeport'), isClickable: nodePortServices > 0 }
      case 'clusterip':
        return { value: clusterIPServices, sublabel: 'ClusterIP', onClick: () => drillToAllServices('clusterip'), isClickable: clusterIPServices > 0 }
      case 'ingresses':
        return { value: 0, sublabel: 'ingresses', isClickable: false }
      case 'endpoints':
        return { value: totalServices, sublabel: 'endpoints', onClick: () => drillToAllServices(), isClickable: totalServices > 0 }
      default:
        return { value: 0 }
    }
  }, [reachableClusters.length, totalServices, loadBalancers, nodePortServices, clusterIPServices, drillToAllServices, drillToAllClusters])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Services"
      subtitle="Monitor Kubernetes services and network connectivity"
      icon="Network"
      storageKey={SERVICES_CARDS_KEY}
      defaultCards={DEFAULT_SERVICES_CARDS}
      statsType="network"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={reachableClusters.length > 0}
      emptyState={{
        title: 'Services Dashboard',
        description: 'Add cards to monitor Kubernetes services, endpoints, and network connectivity across your clusters.',
      }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading service data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
