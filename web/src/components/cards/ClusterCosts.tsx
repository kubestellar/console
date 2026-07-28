import { useMemo, useState, useEffect, useCallback, memo } from 'react'
import { Server, TrendingUp, Info, ExternalLink } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { safeGetJSON, safeRemoveItem, safeSetJSON } from '../../lib/utils/localStorage'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import { FilterBar, PROVIDER_ICONS, CLOUD_PRICING } from './clusterCosts/FilterBar'
import { CostChart } from './clusterCosts/CostChart'
import { BreakdownTable } from './clusterCosts/BreakdownTable'

type CloudProvider = 'estimate' | 'aws' | 'gcp' | 'azure' | 'oci' | 'openshift'

const PROVIDER_OVERRIDES_KEY = 'kubestellar-cluster-provider-overrides'

const loadPersistedOverrides = (configOverrides?: Record<string, CloudProvider>): Record<string, CloudProvider> => {
  if (typeof window === 'undefined') return configOverrides || {}
  return safeGetJSON<Record<string, CloudProvider>>(PROVIDER_OVERRIDES_KEY) || configOverrides || {}
}
type PricingMode = 'uniform' | 'per-cluster'
type SortByOption = 'cost' | 'name' | 'cpus'
type SortTranslationKey = 'cards:clusterCosts.sortCost' | 'cards:clusterCosts.sortName' | 'cards:clusterCosts.sortCPUs'

const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; labelKey: SortTranslationKey }> = [
  { value: 'cost' as const, labelKey: 'cards:clusterCosts.sortCost' },
  { value: 'name' as const, labelKey: 'cards:clusterCosts.sortName' },
  { value: 'cpus' as const, labelKey: 'cards:clusterCosts.sortCPUs' },
]

interface CloudPricing {
  name: string
  cpu: number
  memory: number
  gpu: number
  pricingUrl: string
  notes: string
}

interface ClusterCostsProps {
  config?: {
    cpuCostPerHour?: number
    memoryCostPerGBHour?: number
    gpuCostPerHour?: number
    provider?: CloudProvider
    pricingMode?: PricingMode
    clusterProviders?: Record<string, CloudProvider>
  }
}

const KNOWN_CLUSTER_PROVIDERS: Record<string, CloudProvider> = {
  'prow': 'oci',
}

function detectClusterProvider(name: string, context?: string): CloudProvider {
  const searchStr = `${name} ${context || ''}`.toLowerCase()
  const clusterName = name.toLowerCase()

  if (KNOWN_CLUSTER_PROVIDERS[clusterName]) {
    return KNOWN_CLUSTER_PROVIDERS[clusterName]
  }

  if (searchStr.includes('openshift') || searchStr.includes('ocp') || searchStr.includes('rosa') || searchStr.includes('aro')) return 'openshift'

  if (searchStr.includes('eks') || searchStr.includes('aws') || searchStr.includes('amazon')) return 'aws'
  if (searchStr.includes('gke') || searchStr.includes('gcp') || searchStr.includes('google')) return 'gcp'
  if (searchStr.includes('aks') || searchStr.includes('azure') || searchStr.includes('microsoft')) return 'azure'
  if (searchStr.includes('oke') || searchStr.includes('oci') || searchStr.includes('oracle')) return 'oci'

  return 'estimate'
}

interface ClusterCostItem {
  cluster: string
  name: string
  healthy: boolean
  cpus: number
  memory: number
  gpus: number
  hourly: number
  daily: number
  monthly: number
  provider: CloudProvider
  context?: string
}

const SORT_COMPARATORS = {
  cost: commonComparators.number<ClusterCostItem>('monthly'),
  name: commonComparators.string<ClusterCostItem>('name'),
  cpus: commonComparators.number<ClusterCostItem>('cpus') }

export const ClusterCosts = memo(function ClusterCosts({ config }: ClusterCostsProps) {
  const { t } = useTranslation(['cards', 'common'])

  // Build sort options with translated labels
  const sortOptions = useMemo(() => SORT_OPTIONS_KEYS.map(opt => ({ value: opt.value, label: String(t(opt.labelKey)) })), [t])
  const { deduplicatedClusters: allClusters, isLoading, isRefreshing: clustersRefreshing, isFailed, consecutiveFailures } = useClusters()
  const { nodes: gpuNodes, isRefreshing: gpuRefreshing, isDemoFallback } = useCachedGPUNodes()
  const { drillToCost } = useDrillDownActions()
  const { isDemoMode } = useDemoMode()

  // Report state to CardWrapper for refresh animation
  const hasData = allClusters.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing: clustersRefreshing || gpuRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode || isDemoFallback,
    isFailed,
    consecutiveFailures })

  // Cloud provider selection
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider>(config?.provider || 'estimate')
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [showRatesInfo, setShowRatesInfo] = useState(false)
  const [isAutoDetected, setIsAutoDetected] = useState(false)
  const [pricingMode, setPricingMode] = useState<PricingMode>(config?.pricingMode || 'per-cluster')
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [clusterProviderOverrides, setClusterProviderOverrides] = useState<Record<string, CloudProvider>>(
    () => loadPersistedOverrides(config?.clusterProviders)
  )

  // Persist provider overrides to localStorage
  useEffect(() => {
    if (Object.keys(clusterProviderOverrides).length > 0) {
      safeSetJSON(PROVIDER_OVERRIDES_KEY, clusterProviderOverrides)
      return
    }
    safeRemoveItem(PROVIDER_OVERRIDES_KEY)
  }, [clusterProviderOverrides])

  // Auto-detect cloud provider from cluster names
  const detectedProvider = useMemo((): CloudProvider | null => {
    const clusterNames = allClusters.map(c => c.name.toLowerCase())
    const contexts = allClusters.map(c => (c.context || '').toLowerCase())
    const allNames = [...clusterNames, ...contexts]

    // Check for known cluster mappings first
    for (const cluster of allClusters) {
      if (KNOWN_CLUSTER_PROVIDERS[cluster.name.toLowerCase()]) {
        return KNOWN_CLUSTER_PROVIDERS[cluster.name.toLowerCase()]
      }
    }

    // Check for cloud provider patterns
    if (allNames.some(n => n.includes('openshift') || n.includes('ocp') || n.includes('rosa') || n.includes('aro'))) return 'openshift'
    if (allNames.some(n => n.includes('eks') || n.includes('aws') || n.includes('amazon'))) return 'aws'
    if (allNames.some(n => n.includes('gke') || n.includes('gcp') || n.includes('google'))) return 'gcp'
    if (allNames.some(n => n.includes('aks') || n.includes('azure'))) return 'azure'
    if (allNames.some(n => n.includes('oke') || n.includes('oci') || n.includes('oracle'))) return 'oci'

    return null
  }, [allClusters])

  // Auto-select detected provider (only once on mount)
  useEffect(() => {
    if (detectedProvider && !config?.provider && selectedProvider === 'estimate') {
      setSelectedProvider(detectedProvider)
      setIsAutoDetected(true)
    }
  }, [detectedProvider, config?.provider, selectedProvider])

  // Get pricing from selected provider or custom config
  const pricing = CLOUD_PRICING[selectedProvider]
  const cpuCost = config?.cpuCostPerHour ?? pricing.cpu
  const memoryCost = config?.memoryCostPerGBHour ?? pricing.memory
  const gpuCost = config?.gpuCostPerHour ?? pricing.gpu

  const gpuByCluster = useMemo(() => {
    const map: Record<string, number> = {}
    ;(gpuNodes || []).forEach(node => {
      const clusterKey = (node.cluster ?? '').split('/')[0]
      map[clusterKey] = (map[clusterKey] || 0) + node.gpuCount
    })
    return map
  }, [gpuNodes])

  // Get the provider for a specific cluster (memoized to prevent re-renders)
  const getClusterProvider = useCallback((clusterName: string, context?: string): CloudProvider => {
    // Check for manual override first
    if (clusterProviderOverrides[clusterName]) {
      return clusterProviderOverrides[clusterName]
    }
    // In uniform mode, use the selected provider
    if (pricingMode === 'uniform') {
      return selectedProvider
    }
    // In per-cluster mode, detect from cluster name
    return detectClusterProvider(clusterName, context)
  }, [clusterProviderOverrides, pricingMode, selectedProvider])

  // Compute cost data for ALL clusters (no filtering/sorting -- useCardData handles that)
  const allClusterCosts = useMemo(() => {
    return allClusters.map(cluster => {
      const cpus = cluster.cpuCores || 0
      const memory = 32 * (cluster.nodeCount || 0) // Estimate 32GB per node
      const gpus = gpuByCluster[cluster.name] || 0

      // Get per-cluster pricing
      const provider = getClusterProvider(cluster.name, cluster.context)
      const clusterPricing = CLOUD_PRICING[provider]
      const clusterCpuCost = config?.cpuCostPerHour ?? clusterPricing.cpu
      const clusterMemoryCost = config?.memoryCostPerGBHour ?? clusterPricing.memory
      const clusterGpuCost = config?.gpuCostPerHour ?? clusterPricing.gpu

      const hourly = (cpus * clusterCpuCost) + (memory * clusterMemoryCost) + (gpus * clusterGpuCost)
      const daily = hourly * 24
      const monthly = daily * 30

      return {
        cluster: cluster.name,
        name: cluster.name,
        healthy: cluster.healthy,
        cpus,
        memory,
        gpus,
        hourly,
        daily,
        monthly,
        provider,
        context: cluster.context } as ClusterCostItem
    })
  }, [allClusters, gpuByCluster, getClusterProvider, config])

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: clusterCosts,
    allFilteredItems: allFilteredClusterCosts,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search,
      setSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters: availableClustersForFilter,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef },
    sorting,
    containerRef,
    containerStyle } = useCardData<ClusterCostItem, SortByOption>(allClusterCosts, {
    filter: {
      searchFields: ['name', 'context'] as (keyof ClusterCostItem)[],
      clusterField: 'cluster' as keyof ClusterCostItem,
      storageKey: 'cluster-costs' },
    sort: {
      defaultField: 'cost',
      defaultDirection: 'desc',
      comparators: SORT_COMPARATORS },
    defaultLimit: 5 })

  // Aggregates use allFilteredClusterCosts (all filtered clusters, not just the current page)
  // so the banner and cost bars reflect total spend, not just what's visible.
  const totalMonthly = useMemo(
    () => allFilteredClusterCosts.reduce((sum, c) => sum + c.monthly, 0),
    [allFilteredClusterCosts]
  )
  const totalDaily = useMemo(
    () => allFilteredClusterCosts.reduce((sum, c) => sum + c.daily, 0),
    [allFilteredClusterCosts]
  )

  const providerBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of allFilteredClusterCosts) {
      counts[c.provider] = (counts[c.provider] || 0) + 1
    }
    return counts
  }, [allFilteredClusterCosts])

  const uniqueProviders = useMemo(() =>
    Array.from(new Set(allFilteredClusterCosts.map(c => c.provider))),
    [allFilteredClusterCosts]
  )

  if (isLoading && allClusters.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
          <Skeleton variant="text" width={120} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={60} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t('cards:clusterCosts.clusterCount', { count: totalItems })}
          </span>
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CardControlsRow
            clusterFilter={{
              availableClusters: availableClustersForFilter,
              selectedClusters: localClusterFilter,
              onToggle: toggleClusterFilter,
              onClear: clearClusterFilter,
              isOpen: showClusterFilter,
              setIsOpen: setShowClusterFilter,
              containerRef: clusterFilterRef,
              minClusters: 1 }}
            cardControls={{
              limit: itemsPerPage,
              onLimitChange: setItemsPerPage,
              sortBy: sorting.sortBy,
              sortOptions: sortOptions,
              onSortChange: (v) => sorting.setSortBy(v as SortByOption),
              sortDirection: sorting.sortDirection,
              onSortDirectionChange: sorting.setSortDirection }}
          />
          <button
            onClick={() => setShowRatesInfo(!showRatesInfo)}
            className={`p-1 rounded transition-colors ${showRatesInfo ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-muted-foreground'}`}
            title={t('cards:clusterCosts.viewPricingRates')}
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      <FilterBar
        pricingMode={pricingMode}
        setPricingMode={setPricingMode}
        selectedProvider={selectedProvider}
        setSelectedProvider={setSelectedProvider}
        showSettingsMenu={showSettingsMenu}
        setShowSettingsMenu={setShowSettingsMenu}
        showProviderMenu={showProviderMenu}
        setShowProviderMenu={setShowProviderMenu}
        isAutoDetected={isAutoDetected}
        setIsAutoDetected={setIsAutoDetected}
        detectedProvider={detectedProvider}
        pricing={pricing}
      />

      {/* Rates Info Panel */}
      {showRatesInfo && (
        <div className="mb-3 p-3 rounded-lg bg-secondary/30 border border-border/50 text-xs">
          {pricingMode === 'uniform' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
                <span className="font-medium text-foreground">{t('cards:clusterCosts.pricingRates', { provider: pricing.name })}</span>
                {pricing.pricingUrl && (
                  <a
                    href={sanitizeUrl(pricing.pricingUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <span>{t('cards:clusterCosts.viewPricing')}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mb-2">
                <div className="p-2 rounded bg-secondary/50">
                  <p className="text-muted-foreground mb-0.5">{t('common:common.cpu')}</p>
                  <p className="text-foreground font-medium">${cpuCost.toFixed(3)}/hr</p>
                  <p className="text-2xs text-muted-foreground">{t('cards:clusterCosts.perVCPU')}</p>
                </div>
                <div className="p-2 rounded bg-secondary/50">
                  <p className="text-muted-foreground mb-0.5">{t('common:common.memory')}</p>
                  <p className="text-foreground font-medium">${memoryCost.toFixed(4)}/hr</p>
                  <p className="text-2xs text-muted-foreground">{t('cards:clusterCosts.perGB')}</p>
                </div>
                <div className="p-2 rounded bg-secondary/50">
                  <p className="text-muted-foreground mb-0.5">{t('cards:clusterCosts.gpu')}</p>
                  <p className="text-foreground font-medium">${gpuCost.toFixed(2)}/hr</p>
                  <p className="text-2xs text-muted-foreground">{t('cards:clusterCosts.perGPU')}</p>
                </div>
              </div>
              <p className="text-muted-foreground italic">{t(`cards:clusterCosts.notes.${selectedProvider}`, { defaultValue: pricing.notes })}</p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
                <span className="font-medium text-foreground">{t('cards:clusterCosts.perClusterPricingRates')}</span>
                <span className="text-muted-foreground">{t('cards:clusterCosts.clickBadgesToChange')}</span>
              </div>
              <div className="space-y-2">
                {(Object.keys(CLOUD_PRICING) as CloudProvider[]).filter(p => p !== 'estimate').map(provider => {
                  const p = CLOUD_PRICING[provider]
                  const icon = PROVIDER_ICONS[provider]
                  const count = providerBreakdown[provider] || 0
                  if (count === 0 && !showRatesInfo) return null
                  return (
                    <div key={provider} className={`flex items-center gap-2 p-1.5 rounded ${count > 0 ? 'bg-secondary/50' : 'opacity-50'}`}>
                      <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${icon.bg} ${icon.color}`}>
                        {icon.short}
                      </span>
                      <span className="flex-1 text-foreground">{p.name}</span>
                      <span className="text-muted-foreground">
                        {t('common:common.cpu')} ${p.cpu.toFixed(3)} • {t('common:common.memory')} ${p.memory.toFixed(4)} • {t('cards:clusterCosts.gpu')} ${p.gpu.toFixed(2)}
                      </span>
                      {count > 0 && (
                        <StatusBadge color="purple" size="xs">
                          {count}
                        </StatusBadge>
                      )}
                      {p.pricingUrl && (
                        <a
                          href={sanitizeUrl(p.pricingUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('common:common.searchClusters')}
        className="mb-3"
      />

      <CostChart totalMonthly={totalMonthly} totalDaily={totalDaily} />

      <BreakdownTable
        clusterCosts={clusterCosts}
        containerRef={containerRef}
        containerStyle={containerStyle}
        totalMonthly={totalMonthly}
        clusterProviderOverrides={clusterProviderOverrides}
        setClusterProviderOverrides={setClusterProviderOverrides}
        pricingMode={pricingMode}
        onClusterClick={(cluster) => drillToCost(cluster.name, {
          cpus: cluster.cpus,
          memory: cluster.memory,
          gpus: cluster.gpus,
          hourly: cluster.hourly,
          daily: cluster.daily,
          monthly: cluster.monthly,
          provider: cluster.provider
        })}
      />

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border/50 space-y-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {pricingMode === 'uniform' ? (
              <>
                <span>{t('cards:clusterCosts.basedOnRates', { provider: pricing.name })}</span>
                {pricing.pricingUrl && (
                  <a
                    href={sanitizeUrl(pricing.pricingUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 transition-colors"
                    title={t('cards:clusterCosts.viewOfficialPricing')}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </>
            ) : (
              <>
                <span>{t('cards:clusterCosts.mixedPricing')}</span>
                {/* Show unique providers used */}
                {uniqueProviders.map(provider => {
                  const count = providerBreakdown[provider] || 0
                  const icon = PROVIDER_ICONS[provider]
                  return (
                    <span
                      key={provider}
                      className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${icon.bg} ${icon.color}`}
                      title={t('cards:clusterCosts.clustersUsingProvider', { count, provider: CLOUD_PRICING[provider].name })}
                    >
                      {icon.short} ({count})
                    </span>
                  )
                })}
              </>
            )}
          </div>
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" aria-hidden="true" />
            {t('cards:clusterCosts.clusterCount', { count: totalItems })}
          </span>
        </div>
        {/* Estimation methodology links */}
        <div className="flex items-center justify-center gap-3 pt-1 text-2xs">
          <a
            href="https://www.finops.org/introduction/what-is-finops/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/70 hover:text-purple-400 transition-colors"
            title={t('cards:clusterCosts.cloudCostMgmt')}
          >
            {t('cards:clusterCosts.finOpsFoundation')}
          </a>
          <span className="text-muted-foreground/30">•</span>
          <a
            href="https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/70 hover:text-purple-400 transition-colors"
            title={t('cards:clusterCosts.k8sResourceMgmt')}
          >
            {t('cards:clusterCosts.k8sResourceMgmtLink')}
          </a>
          <span className="text-muted-foreground/30">•</span>
          <a
            href="https://www.opencost.io/docs/specification"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/70 hover:text-purple-400 transition-colors"
            title={t('cards:clusterCosts.openCostSpec')}
          >
            {t('cards:clusterCosts.openCostSpecLink')}
          </a>
        </div>
      </div>
    </div>
  )
})
