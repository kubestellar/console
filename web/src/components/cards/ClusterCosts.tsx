import { useMemo, useState, useEffect, useCallback, memo } from 'react'
import { Server, Info, ExternalLink, ChevronDown, Sparkles, Settings2 } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { useCardData } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { safeRemoveItem, safeSetJSON } from '../../lib/utils/localStorage'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import { ClusterCostsRatesPanel } from './ClusterCostsRatesPanel'
import { ClusterCostsRow } from './ClusterCostsRow'
import { ClusterCostsFooter } from './ClusterCostsFooter'
import {
  CLOUD_PRICING,
  PROVIDER_ICONS,
  KNOWN_CLUSTER_PROVIDERS,
  PROVIDER_OVERRIDES_KEY,
  SORT_COMPARATORS,
  SORT_OPTIONS_KEYS,
  detectClusterProvider,
  loadPersistedOverrides,
  type CloudProvider,
  type ClusterCostItem,
  type ClusterCostsProps,
  type PricingMode,
  type SortByOption,
} from './ClusterCosts.constants'


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
          {/* Info button */}
          <button
            onClick={() => setShowRatesInfo(!showRatesInfo)}
            className={`p-1 rounded transition-colors ${showRatesInfo ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-muted-foreground'}`}
            title={t('cards:clusterCosts.viewPricingRates')}
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pricing Mode and Provider Selector */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2 mb-3">
        <div className="flex items-center gap-2">
          {/* Pricing Mode Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md border transition-colors ${
                showSettingsMenu
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-secondary/50 hover:bg-secondary border-border text-muted-foreground'
              }`}
              title={t('cards:clusterCosts.pricingSettings')}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden @sm:inline">{pricingMode === 'per-cluster' ? t('cards:clusterCosts.perCluster') : t('cards:clusterCosts.uniform')}</span>
            </button>
            {showSettingsMenu && (
              <div className="absolute top-full left-0 mt-1 w-52 bg-card border border-border rounded-lg shadow-lg z-20 py-2"
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                  e.preventDefault()
                  const items = e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])')
                  const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
                  if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
                  else items[Math.max(idx - 1, 0)]?.focus()
                }}
              >
                <div className="px-3 py-1.5 text-2xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('cards:clusterCosts.pricingMode')}
                </div>
                <button
                  onClick={() => {
                    setPricingMode('per-cluster')
                    setShowSettingsMenu(false)
                  }}
                  className={`w-full px-3 py-2 text-xs text-left hover:bg-secondary transition-colors flex flex-wrap items-center justify-between gap-y-2 ${
                    pricingMode === 'per-cluster' ? 'text-purple-400 bg-purple-500/10' : 'text-foreground'
                  }`}
                >
                  <div>
                    <div className="font-medium">{t('cards:clusterCosts.perCluster')}</div>
                    <div className="text-2xs text-muted-foreground">{t('cards:clusterCosts.perClusterDesc')}</div>
                  </div>
                  {pricingMode === 'per-cluster' && <Sparkles className="w-3.5 h-3.5 text-yellow-400" />}
                </button>
                <button
                  onClick={() => {
                    setPricingMode('uniform')
                    setShowSettingsMenu(false)
                  }}
                  className={`w-full px-3 py-2 text-xs text-left hover:bg-secondary transition-colors flex flex-wrap items-center justify-between gap-y-2 ${
                    pricingMode === 'uniform' ? 'text-purple-400 bg-purple-500/10' : 'text-foreground'
                  }`}
                >
                  <div>
                    <div className="font-medium">{t('cards:clusterCosts.uniform')}</div>
                    <div className="text-2xs text-muted-foreground">{t('cards:clusterCosts.uniformDesc')}</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Uniform Provider Selector (only in uniform mode) */}
          {pricingMode === 'uniform' && (
            <div className="relative">
              <button
                onClick={() => setShowProviderMenu(!showProviderMenu)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
                  selectedProvider !== 'estimate'
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary/50 hover:bg-secondary border-border text-foreground'
                }`}
              >
                <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${PROVIDER_ICONS[selectedProvider].bg} ${PROVIDER_ICONS[selectedProvider].color}`}>
                  {PROVIDER_ICONS[selectedProvider].short}
                </span>
                <span className="font-medium">{pricing.name}</span>
                {isAutoDetected && (
                  <span title={t('cards:clusterCosts.autoDetectedFrom')}><Sparkles className="w-3 h-3 text-yellow-400" /></span>
                )}
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${showProviderMenu ? 'rotate-180' : ''}`} />
              </button>
              {showProviderMenu && (
                <div className="absolute top-full left-0 mt-1 w-44 bg-card border border-border rounded-lg shadow-lg z-10 py-1"
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                    e.preventDefault()
                    const items = e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])')
                    const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
                    if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
                    else items[Math.max(idx - 1, 0)]?.focus()
                  }}
                >
                  {(Object.keys(CLOUD_PRICING) as CloudProvider[]).map(provider => (
                    <button
                      key={provider}
                      onClick={() => {
                        setSelectedProvider(provider)
                        setShowProviderMenu(false)
                        setIsAutoDetected(false)
                      }}
                      className={`w-full px-3 py-1.5 text-xs text-left hover:bg-secondary transition-colors flex items-center gap-2 ${
                        selectedProvider === provider ? 'text-purple-400 bg-purple-500/10' : 'text-foreground'
                      }`}
                    >
                      <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${PROVIDER_ICONS[provider].bg} ${PROVIDER_ICONS[provider].color}`}>
                        {PROVIDER_ICONS[provider].short}
                      </span>
                      <span className="flex-1">{CLOUD_PRICING[provider].name}</span>
                      {provider === detectedProvider && (
                        <StatusBadge color="yellow" size="xs">{t('cards:clusterCosts.detected')}</StatusBadge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Per-cluster mode indicator */}
          {pricingMode === 'per-cluster' && (
            <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
              <Sparkles className="w-3 h-3 text-yellow-400" />
              <span>{t('cards:clusterCosts.autoDetectingVendors')}</span>
            </div>
          )}
        </div>

        {/* Provider link (uniform mode only) */}
        {pricingMode === 'uniform' && selectedProvider !== 'estimate' && pricing.pricingUrl && (
          <a
            href={sanitizeUrl(pricing.pricingUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            title={t('cards:clusterCosts.viewProviderPricing', { provider: pricing.name })}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Rates Info Panel */}
      <ClusterCostsRatesPanel
        showRatesInfo={showRatesInfo}
        isRefreshing={clustersRefreshing || gpuRefreshing}
        pricingMode={pricingMode}
        pricing={pricing}
        selectedProvider={selectedProvider}
        cpuCost={cpuCost}
        memoryCost={memoryCost}
        gpuCost={gpuCost}
        providerBreakdown={providerBreakdown}
      />

      {/* Local Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('common:common.searchClusters')}
        className="mb-3"
      />

      {/* Total costs */}
      <div className="p-4 rounded-lg bg-linear-to-r from-green-500/20 to-green-500/20 border border-green-500/30 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <div>
            <p className="text-xs text-green-400 mb-1">{t('cards:clusterCosts.estimatedMonthly')}</p>
            <p className="text-2xl font-bold text-foreground">${totalMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">{t('cards:clusterCosts.daily')}</p>
            <p className="text-lg font-medium text-foreground">${totalDaily.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      {/* Per-cluster breakdown */}
      <div ref={containerRef} className="flex-1 space-y-2 overflow-y-auto" style={containerStyle}>
        {clusterCosts.map((cluster) => (
          <ClusterCostsRow
            key={cluster.name}
            cluster={cluster}
            totalMonthly={totalMonthly}
            pricingMode={pricingMode}
            isOverridden={clusterProviderOverrides[cluster.name] !== undefined}
            onDrillDown={(c) => drillToCost(c.name, {
              cpus: c.cpus,
              memory: c.memory,
              gpus: c.gpus,
              hourly: c.hourly,
              daily: c.daily,
              monthly: c.monthly,
              provider: c.provider })}
            onCycleProvider={(clusterName, nextProvider) => {
              setClusterProviderOverrides(prev => ({
                ...prev,
                [clusterName]: nextProvider
              }))
            }}
            onClearOverride={(clusterName) => {
              if (clusterProviderOverrides[clusterName]) {
                setClusterProviderOverrides(prev => {
                  const next = { ...prev }
                  delete next[clusterName]
                  return next
                })
              }
            }}
          />
        ))}
      </div>

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
      <ClusterCostsFooter
        pricingMode={pricingMode}
        pricing={pricing}
        uniqueProviders={uniqueProviders}
        providerBreakdown={providerBreakdown}
        totalItems={totalItems}
      />
    </div>
  )
})
