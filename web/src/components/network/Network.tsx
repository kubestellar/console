import { useCallback } from 'react'
import { AlertCircle } from 'lucide-react'
import { useServices } from '../../hooks/useMCP'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'

const NETWORK_CARDS_KEY = 'kubestellar-network-cards'

// Default cards for the network dashboard
const DEFAULT_NETWORK_CARDS = getDefaultCards('network')

export function Network() {
  const { services, isLoading: servicesLoading, isRefreshing: servicesRefreshing, lastUpdated, refetch, error } = useServices()

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
  } = useGlobalFilters()
  const { drillToService } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const isModeSwitching = useIsModeSwitching()

  // Filter services based on global cluster selection
  const filteredServices = services.filter(s =>
    isAllClustersSelected || (s.cluster && globalSelectedClusters.includes(s.cluster))
  )

  // Calculate service stats
  const loadBalancers = filteredServices.filter(s => s.type === 'LoadBalancer').length
  const nodePortServices = filteredServices.filter(s => s.type === 'NodePort').length
  const clusterIPServices = filteredServices.filter(s => s.type === 'ClusterIP').length

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    const drillToFirstService = () => {
      if (filteredServices.length > 0 && filteredServices[0]) {
        const svc = filteredServices[0]
        if (svc?.cluster && svc?.namespace) {
          drillToService(svc.cluster, svc.namespace, svc.name)
        }
      }
    }
    const drillToLoadBalancer = () => {
      const svc = filteredServices.find(s => s.type === 'LoadBalancer')
      if (svc?.cluster && svc?.namespace) {
        drillToService(svc.cluster, svc.namespace, svc.name)
      }
    }
    const drillToNodePort = () => {
      const svc = filteredServices.find(s => s.type === 'NodePort')
      if (svc?.cluster && svc?.namespace) {
        drillToService(svc.cluster, svc.namespace, svc.name)
      }
    }
    const drillToClusterIP = () => {
      const svc = filteredServices.find(s => s.type === 'ClusterIP')
      if (svc?.cluster && svc?.namespace) {
        drillToService(svc.cluster, svc.namespace, svc.name)
      }
    }

    switch (blockId) {
      case 'services':
        return { value: filteredServices.length, sublabel: 'total services', onClick: drillToFirstService, isClickable: filteredServices.length > 0 }
      case 'loadbalancers':
        return { value: loadBalancers, sublabel: 'external access', onClick: drillToLoadBalancer, isClickable: loadBalancers > 0 }
      case 'nodeport':
        return { value: nodePortServices, sublabel: 'node-level access', onClick: drillToNodePort, isClickable: nodePortServices > 0 }
      case 'clusterip':
        return { value: clusterIPServices, sublabel: 'internal only', onClick: drillToClusterIP, isClickable: clusterIPServices > 0 }
      case 'ingresses':
        return { value: '-', sublabel: 'ingresses', isClickable: false }
      case 'endpoints':
        return { value: filteredServices.length, sublabel: 'endpoints', isClickable: false }
      default:
        return { value: '-', sublabel: '' }
    }
  }, [filteredServices, loadBalancers, nodePortServices, clusterIPServices, drillToService])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  // Show skeleton during mode switching for smooth transitions
  const showSkeletons = (services.length === 0 && servicesLoading) || isModeSwitching

  return (
    <DashboardPage
      title="Network"
      subtitle="Monitor network resources across clusters"
      icon="Globe"
      storageKey={NETWORK_CARDS_KEY}
      defaultCards={DEFAULT_NETWORK_CARDS}
      statsType="network"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={servicesLoading}
      isRefreshing={servicesRefreshing}
      lastUpdated={lastUpdated}
      hasData={services.length > 0 || !showSkeletons}
      emptyState={{
        title: 'Network Dashboard',
        description: 'Add cards to monitor Ingresses, NetworkPolicies, and service mesh configurations across your clusters.',
      }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading network data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
