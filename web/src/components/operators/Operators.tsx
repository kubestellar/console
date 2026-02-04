import { useCallback, useMemo } from 'react'
import { AlertCircle } from 'lucide-react'
import { useClusters, useOperatorSubscriptions, useOperators } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'

const OPERATORS_CARDS_KEY = 'kubestellar-operators-cards'

// Default cards for the operators dashboard
const DEFAULT_OPERATORS_CARDS = getDefaultCards('operators')

export function Operators() {
  const { clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error: clustersError } = useClusters()
  const { subscriptions: operatorSubs, refetch: refetchSubs, error: subsError } = useOperatorSubscriptions()
  const { operators: allOperators, refetch: refetchOps, error: opsError } = useOperators()
  const error = clustersError || subsError || opsError

  const { drillToAllOperators, drillToAllClusters } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected, filterByStatus, customFilter } = useGlobalFilters()

  const handleRefresh = useCallback(() => {
    refetch()
    refetchSubs()
    refetchOps()
  }, [refetch, refetchSubs, refetchOps])

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Filter operator subscriptions based on global cluster selection
  const filteredSubscriptions = useMemo(() => {
    let result = operatorSubs.filter(op => {
      if (isAllClustersSelected) return true
      const clusterName = op.cluster?.split('/')[0] || ''
      return globalSelectedClusters.includes(clusterName) || globalSelectedClusters.includes(op.cluster || '')
    })
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(op =>
        op.name.toLowerCase().includes(query) ||
        op.namespace.toLowerCase().includes(query) ||
        op.channel.toLowerCase().includes(query)
      )
    }
    return result
  }, [operatorSubs, isAllClustersSelected, globalSelectedClusters, customFilter])

  // Filter operators based on global cluster selection
  const filteredOperatorsAPI = useMemo(() => {
    let result = allOperators.filter(op => {
      if (isAllClustersSelected) return true
      const clusterName = op.cluster?.split('/')[0] || ''
      return globalSelectedClusters.includes(clusterName) || globalSelectedClusters.includes(op.cluster || '')
    })
    result = filterByStatus(result)
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(op =>
        op.name.toLowerCase().includes(query) ||
        op.namespace.toLowerCase().includes(query) ||
        op.version.toLowerCase().includes(query)
      )
    }
    return result
  }, [allOperators, isAllClustersSelected, globalSelectedClusters, filterByStatus, customFilter])

  // Calculate operator stats
  const totalOperators = filteredOperatorsAPI.length
  const installedOperators = filteredOperatorsAPI.filter(op => op.status === 'Succeeded').length
  const installingOperators = filteredOperatorsAPI.filter(op => op.status === 'Installing' || op.status === 'Upgrading').length
  const upgradesAvailable = filteredSubscriptions.filter(op => op.pendingUpgrade).length
  const failingOperators = filteredOperatorsAPI.filter(op => op.status === 'Failed').length

  // Stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'operators':
        return { value: totalOperators, sublabel: 'total operators', onClick: () => drillToAllOperators(), isClickable: totalOperators > 0 }
      case 'installed':
        return { value: installedOperators, sublabel: 'installed', onClick: () => drillToAllOperators('installed'), isClickable: installedOperators > 0 }
      case 'installing':
        return { value: installingOperators, sublabel: 'installing', onClick: () => drillToAllOperators('installing'), isClickable: installingOperators > 0 }
      case 'upgrades':
        return { value: upgradesAvailable, sublabel: 'upgrades available', onClick: () => drillToAllOperators('upgrades'), isClickable: upgradesAvailable > 0 }
      case 'subscriptions':
        return { value: filteredSubscriptions.length, sublabel: 'subscriptions', onClick: () => drillToAllOperators(), isClickable: filteredSubscriptions.length > 0 }
      case 'crds':
        return { value: 0, sublabel: 'CRDs' }
      case 'failing':
        return { value: failingOperators, sublabel: 'failing', onClick: () => drillToAllOperators('failed'), isClickable: failingOperators > 0 }
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', onClick: () => drillToAllClusters(), isClickable: reachableClusters.length > 0 }
      default:
        return { value: 0 }
    }
  }, [totalOperators, installedOperators, installingOperators, upgradesAvailable, failingOperators, reachableClusters.length, filteredSubscriptions, drillToAllOperators, drillToAllClusters])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Operators"
      subtitle="Monitor OLM operators, subscriptions, and CRDs"
      icon="Cog"
      storageKey={OPERATORS_CARDS_KEY}
      defaultCards={DEFAULT_OPERATORS_CARDS}
      statsType="operators"
      getStatValue={getStatValue}
      onRefresh={handleRefresh}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={totalOperators > 0 || reachableClusters.length > 0}
      emptyState={{
        title: 'Operators Dashboard',
        description: 'Add cards to monitor OLM operators, subscriptions, and Custom Resource Definitions across your clusters.',
      }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading operator data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
