import { useState, useEffect, useCallback, useMemo } from 'react'
import { AlertCircle } from 'lucide-react'
import { STORAGE_KEY_CLUSTER_PROVIDER_OVERRIDES } from '../../lib/constants'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { useTranslation } from 'react-i18next'

const COST_CARDS_KEY = 'kubestellar-cost-cards'

// Default cards for the Cost dashboard
const DEFAULT_COST_CARDS = getDefaultCards('cost')

export function Cost() {
  const { t: _t } = useTranslation()
  const { clusters, isLoading, refetch, lastUpdated, isRefreshing: dataRefreshing, error } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const { drillToCost } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Cloud provider pricing (same as ClusterCosts card for consistency)
  type CloudProvider = 'estimate' | 'aws' | 'gcp' | 'azure' | 'oci' | 'openshift'
  const CLOUD_PRICING: Record<CloudProvider, { cpu: number; memory: number; gpu: number }> = {
    estimate: { cpu: 0.05, memory: 0.01, gpu: 2.50 },
    aws: { cpu: 0.048, memory: 0.012, gpu: 3.06 },
    gcp: { cpu: 0.0475, memory: 0.0064, gpu: 2.48 },
    azure: { cpu: 0.05, memory: 0.011, gpu: 2.07 },
    oci: { cpu: 0.025, memory: 0.0015, gpu: 2.95 },
    openshift: { cpu: 0.048, memory: 0.012, gpu: 3.00 },
  }

  // Read provider overrides from localStorage (same key as ClusterCosts card)
  const [providerOverrides, setProviderOverrides] = useState<Record<string, CloudProvider>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CLUSTER_PROVIDER_OVERRIDES)
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })

  // Listen for localStorage changes (when user changes provider in ClusterCosts card)
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_CLUSTER_PROVIDER_OVERRIDES)
        setProviderOverrides(saved ? JSON.parse(saved) : {})
      } catch { /* ignore */ }
    }
    window.addEventListener('storage', handleStorageChange)
    // Also poll for changes since storage event doesn't fire for same-tab changes
    const interval = setInterval(handleStorageChange, 1000)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
    }
  }, [])

  // Detect cloud provider from cluster name (matches ClusterCosts logic)
  const detectClusterProvider = (name: string, context?: string): CloudProvider => {
    // Check for manual override first
    if (providerOverrides[name]) {
      return providerOverrides[name]
    }
    const searchStr = `${name} ${context || ''}`.toLowerCase()
    if (searchStr.includes('openshift') || searchStr.includes('ocp') || searchStr.includes('rosa') || searchStr.includes('aro')) return 'openshift'
    if (searchStr.includes('eks') || searchStr.includes('aws') || searchStr.includes('amazon')) return 'aws'
    if (searchStr.includes('gke') || searchStr.includes('gcp') || searchStr.includes('google')) return 'gcp'
    if (searchStr.includes('aks') || searchStr.includes('azure') || searchStr.includes('microsoft')) return 'azure'
    if (searchStr.includes('oke') || searchStr.includes('oci') || searchStr.includes('oracle') || name.toLowerCase() === 'prow') return 'oci'
    return 'estimate'
  }

  // Count GPUs from GPU nodes
  const gpuByCluster = useMemo(() => {
    const map: Record<string, number> = {}
    gpuNodes.forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      map[clusterKey] = (map[clusterKey] || 0) + node.gpuCount
    })
    return map
  }, [gpuNodes])

  // Calculate per-cluster costs (matches ClusterCosts card exactly)
  const costStats = useMemo(() => {
    let totalCPU = 0
    let totalMemoryGB = 0
    let totalGPUs = 0
    let totalMonthly = 0
    let cpuMonthly = 0
    let memoryMonthly = 0
    let gpuMonthly = 0

    reachableClusters.forEach(cluster => {
      const cpus = cluster.cpuCores || 0
      const memory = 32 * (cluster.nodeCount || 0) // Estimate 32GB per node (matches ClusterCosts)
      const gpus = gpuByCluster[cluster.name] || 0

      // Get per-cluster pricing based on detected provider
      const provider = detectClusterProvider(cluster.name, cluster.context)
      const pricing = CLOUD_PRICING[provider]

      const clusterHourly = (cpus * pricing.cpu) + (memory * pricing.memory) + (gpus * pricing.gpu)
      const clusterMonthly = clusterHourly * 24 * 30

      totalCPU += cpus
      totalMemoryGB += memory
      totalGPUs += gpus
      totalMonthly += clusterMonthly
      cpuMonthly += cpus * pricing.cpu * 24 * 30
      memoryMonthly += memory * pricing.memory * 24 * 30
      gpuMonthly += gpus * pricing.gpu * 24 * 30
    })

    const totalStorageGB = reachableClusters.reduce((sum, c) => sum + (c.storageGB || 0), 0)
    const storageCostPerGBMonth = 0.10
    const storageMonthly = totalStorageGB * storageCostPerGBMonth

    return {
      totalCPU,
      totalMemoryGB,
      totalGPUs,
      totalStorageGB,
      totalMonthly: totalMonthly + storageMonthly,
      cpuMonthly,
      memoryMonthly,
      gpuMonthly,
      storageMonthly,
    }
  }, [reachableClusters, gpuByCluster, providerOverrides])

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    const drillToCostType = (type: string) => {
      drillToCost('all', { costType: type, totalMonthly: costStats.totalMonthly })
    }

    switch (blockId) {
      case 'total_cost':
        return { value: `$${Math.round(costStats.totalMonthly).toLocaleString()}`, sublabel: 'est. monthly', onClick: () => drillToCostType('total'), isClickable: costStats.totalMonthly > 0 }
      case 'cpu_cost':
        return { value: `$${Math.round(costStats.cpuMonthly).toLocaleString()}`, sublabel: `${costStats.totalCPU} cores`, onClick: () => drillToCostType('cpu'), isClickable: costStats.cpuMonthly > 0 }
      case 'memory_cost':
        return { value: `$${Math.round(costStats.memoryMonthly).toLocaleString()}`, sublabel: `${costStats.totalMemoryGB} GB`, onClick: () => drillToCostType('memory'), isClickable: costStats.memoryMonthly > 0 }
      case 'storage_cost':
        return { value: `$${Math.round(costStats.storageMonthly).toLocaleString()}`, sublabel: costStats.totalStorageGB >= 1024 ? `${(costStats.totalStorageGB / 1024).toFixed(1)} TB` : `${Math.round(costStats.totalStorageGB)} GB`, onClick: () => drillToCostType('storage'), isClickable: costStats.storageMonthly > 0 }
      case 'network_cost':
        return { value: '$0', sublabel: 'not tracked', isClickable: false }
      case 'gpu_cost':
        return { value: `$${Math.round(costStats.gpuMonthly).toLocaleString()}`, sublabel: `${costStats.totalGPUs} GPUs`, onClick: () => drillToCostType('gpu'), isClickable: costStats.gpuMonthly > 0 }
      default:
        return { value: 0 }
    }
  }, [costStats, drillToCost])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Cost Management"
      subtitle="Monitor and optimize resource costs across clusters"
      icon="DollarSign"
      storageKey={COST_CARDS_KEY}
      defaultCards={DEFAULT_COST_CARDS}
      statsType="cost"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={reachableClusters.length > 0}
      emptyState={{
        title: 'Cost Dashboard',
        description: 'Add cards to monitor and optimize resource costs across your clusters.',
      }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading cost data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
