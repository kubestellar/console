import { AlertCircle, Server } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClusters, useServices } from '../../hooks/useMCP'
import { useIngresses } from '../../hooks/mcp/networking'
import { ROUTES } from '../../config/routes'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'

const SERVICES_CARDS_KEY = 'kubestellar-services-cards'

// Default cards for the services dashboard
const DEFAULT_SERVICES_CARDS = getDefaultCards('services')

export function Services() {
  const navigate = useNavigate()
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error: clustersError } = useClusters()
  const { services, error: servicesError } = useServices()
  const { ingresses } = useIngresses()
  const error = clustersError || servicesError

  const { drillToAllServices, drillToAllClusters } = useDrillDownActions()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Filter clusters based on global selection
  const filteredClusters = useMemo(() => clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  ), [clusters, globalSelectedClusters, isAllClustersSelected])
  const reachableClusters = useMemo(
    () => filteredClusters.filter(c => c.reachable !== false),
    [filteredClusters],
  )

  // Filter services by selected clusters
  const filteredServices = useMemo(() => services.filter(s =>
    isAllClustersSelected || globalSelectedClusters.includes(s.cluster || '')
  ), [globalSelectedClusters, isAllClustersSelected, services])

  // Calculate service stats
  const totalServices = filteredServices.length
  const loadBalancers = useMemo(
    () => filteredServices.filter(s => s.type === 'LoadBalancer').length,
    [filteredServices],
  )
  const nodePortServices = useMemo(
    () => filteredServices.filter(s => s.type === 'NodePort').length,
    [filteredServices],
  )
  const clusterIPServices = useMemo(
    () => filteredServices.filter(s => s.type === 'ClusterIP').length,
    [filteredServices],
  )
  // Issue #6150: "Endpoints" stat must reflect the actual number of
  // ready backend addresses (pods) across all services, not the number
  // of services. Each service's `endpoints` field is the sum of ready
  // addresses from its core/v1 Endpoints object as populated by the
  // backend. Services with no matching pods contribute 0.
  const totalEndpoints = useMemo(() => filteredServices.reduce(
    (sum, svc) => sum + (svc.endpoints ?? 0),
    0,
  ), [filteredServices])

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
      case 'ingresses': {
        // Show actual ingress count instead of hardcoded 0 (#7517)
        const allIngresses = (ingresses || []).filter(i =>
          isAllClustersSelected || globalSelectedClusters.includes(i.cluster || '')
        )
        return { value: allIngresses.length, sublabel: 'ingresses', isClickable: false }
      }
      case 'endpoints':
        return { value: totalEndpoints, sublabel: 'endpoints', onClick: () => drillToAllServices(), isClickable: totalEndpoints > 0 }
      default:
        return { value: 0 }
    }
  }, [
    clusterIPServices,
    drillToAllClusters,
    drillToAllServices,
    globalSelectedClusters,
    ingresses,
    isAllClustersSelected,
    loadBalancers,
    nodePortServices,
    reachableClusters.length,
    totalEndpoints,
    totalServices,
  ])

  const emptyStateConfig = useMemo(() => ({
    title: reachableClusters.length === 0 ? 'No services yet' : 'Services Dashboard',
    description: reachableClusters.length === 0
      ? 'Connect a Kubernetes cluster to start monitoring services, endpoints, and network connectivity.'
      : 'Add cards to monitor Kubernetes services, endpoints, and network connectivity across your clusters.',
    secondaryAction: reachableClusters.length === 0
      ? {
          label: 'Connect a cluster',
          icon: Server,
          onClick: () => navigate(ROUTES.CLUSTERS),
        }
      : undefined,
  }), [navigate, reachableClusters.length])

  return (
    <DashboardPage
      title="Services"
      subtitle="Monitor Kubernetes services and network connectivity"
      icon="Network"
      rightExtra={<RotatingTip page="services" />}
      storageKey={SERVICES_CARDS_KEY}
      defaultCards={DEFAULT_SERVICES_CARDS}
      statsType="network"
      getStatValue={getDashboardStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={reachableClusters.length > 0}
      emptyState={emptyStateConfig}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading service data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
