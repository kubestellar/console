import { useMemo, useState, useEffect, useCallback } from 'react'
import { DollarSign, Server, Cpu, HardDrive, TrendingUp, Info, ExternalLink, ChevronDown, Sparkles, Settings2, Search, ChevronRight } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { RefreshButton } from '../ui/RefreshIndicator'
import { CloudProviderIcon, type CloudProvider as IconProvider } from '../ui/CloudProviderIcon'

type CloudProvider = 'estimate' | 'aws' | 'gcp' | 'azure' | 'oci' | 'openshift'

// Map ClusterCosts provider type to CloudProviderIcon provider type
const mapProviderToIconProvider = (provider: CloudProvider): IconProvider => {
  switch (provider) {
    case 'aws': return 'eks'
    case 'gcp': return 'gke'
    case 'azure': return 'aks'
    case 'openshift': return 'openshift'
    case 'oci': return 'oci'
    case 'estimate':
    default:
      return 'kubernetes'
  }
}

// LocalStorage key for persisting provider overrides (moved outside component)
const PROVIDER_OVERRIDES_KEY = 'kubestellar-cluster-provider-overrides'

// Load persisted overrides from localStorage (moved outside component)
const loadPersistedOverrides = (configOverrides?: Record<string, CloudProvider>): Record<string, CloudProvider> => {
  try {
    const saved = localStorage.getItem(PROVIDER_OVERRIDES_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch {
    // Ignore parse errors
  }
  return configOverrides || {}
}
type PricingMode = 'uniform' | 'per-cluster'

// Cloud provider icons (simple text badges for now, could be SVG logos)
const PROVIDER_ICONS: Record<CloudProvider, { color: string; bg: string; short: string }> = {
  estimate: { color: 'text-gray-400', bg: 'bg-gray-500/20', short: 'EST' },
  aws: { color: 'text-orange-400', bg: 'bg-orange-500/20', short: 'AWS' },
  gcp: { color: 'text-blue-400', bg: 'bg-blue-500/20', short: 'GCP' },
  azure: { color: 'text-sky-400', bg: 'bg-sky-500/20', short: 'AZR' },
  oci: { color: 'text-red-400', bg: 'bg-red-500/20', short: 'OCI' },
  openshift: { color: 'text-red-500', bg: 'bg-red-600/20', short: 'OCP' },
}

interface CloudPricing {
  name: string
  cpu: number      // per vCPU per hour
  memory: number   // per GB per hour
  gpu: number      // per NVIDIA GPU per hour (rough average)
  pricingUrl: string
  notes: string
}

// Cloud provider pricing (approximate, varies by region and instance type)
// These are ballpark figures for reference - actual costs depend on instance types, commitments, etc.
const CLOUD_PRICING: Record<CloudProvider, CloudPricing> = {
  estimate: {
    name: 'Estimate',
    cpu: 0.05,
    memory: 0.01,
    gpu: 2.50,
    pricingUrl: '',
    notes: 'Generic estimates for rough cost calculation',
  },
  aws: {
    name: 'AWS',
    cpu: 0.048,      // Based on m5.large ($0.096/hr for 2 vCPU)
    memory: 0.012,   // Based on m5.large pricing
    gpu: 3.06,       // Based on p3.2xlarge (V100)
    pricingUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/',
    notes: 'Based on US East on-demand pricing',
  },
  gcp: {
    name: 'GCP',
    cpu: 0.0475,     // n2-standard pricing
    memory: 0.0064,  // n2-standard pricing
    gpu: 2.48,       // NVIDIA V100
    pricingUrl: 'https://cloud.google.com/compute/pricing',
    notes: 'Based on us-central1 on-demand pricing',
  },
  azure: {
    name: 'Azure',
    cpu: 0.05,       // D-series pricing
    memory: 0.011,   // D-series pricing
    gpu: 2.07,       // NC6 (K80) pricing
    pricingUrl: 'https://azure.microsoft.com/en-us/pricing/details/virtual-machines/',
    notes: 'Based on East US on-demand pricing',
  },
  oci: {
    name: 'OCI',
    cpu: 0.025,      // VM.Standard.E4.Flex
    memory: 0.0015,  // VM.Standard.E4.Flex
    gpu: 2.95,       // GPU.A10
    pricingUrl: 'https://www.oracle.com/cloud/price-list/',
    notes: 'Based on Flex shapes pricing',
  },
  openshift: {
    name: 'OpenShift',
    cpu: 0.048,      // Based on ROSA (Red Hat OpenShift on AWS) pricing
    memory: 0.012,   // Based on ROSA pricing
    gpu: 3.00,       // GPU node pricing estimate
    pricingUrl: 'https://www.redhat.com/en/technologies/cloud-computing/openshift/aws/pricing',
    notes: 'Based on Red Hat OpenShift on AWS (ROSA) pricing',
  },
}

interface ClusterCostsProps {
  config?: {
    cpuCostPerHour?: number
    memoryCostPerGBHour?: number
    gpuCostPerHour?: number
    provider?: CloudProvider
    pricingMode?: PricingMode
    /** Per-cluster provider overrides: { clusterName: provider } */
    clusterProviders?: Record<string, CloudProvider>
  }
}

// Known cluster name to provider mappings (for clusters without provider keywords in name)
const KNOWN_CLUSTER_PROVIDERS: Record<string, CloudProvider> = {
  'prow': 'oci',  // Prow CI cluster runs on OCI
}

/** Detect cloud provider from a single cluster name/context */
function detectClusterProvider(name: string, context?: string): CloudProvider {
  const searchStr = `${name} ${context || ''}`.toLowerCase()
  const clusterName = name.toLowerCase()

  // Check known cluster mappings first
  if (KNOWN_CLUSTER_PROVIDERS[clusterName]) {
    return KNOWN_CLUSTER_PROVIDERS[clusterName]
  }

  // OpenShift detection (check before other providers as OCP can run on any cloud)
  if (searchStr.includes('openshift') || searchStr.includes('ocp') || searchStr.includes('rosa') || searchStr.includes('aro')) return 'openshift'

  // Cloud provider detection
  if (searchStr.includes('eks') || searchStr.includes('aws') || searchStr.includes('amazon')) return 'aws'
  if (searchStr.includes('gke') || searchStr.includes('gcp') || searchStr.includes('google')) return 'gcp'
  if (searchStr.includes('aks') || searchStr.includes('azure') || searchStr.includes('microsoft')) return 'azure'
  if (searchStr.includes('oke') || searchStr.includes('oci') || searchStr.includes('oracle')) return 'oci'

  return 'estimate'
}

export function ClusterCosts({ config }: ClusterCostsProps) {
  const { clusters: allClusters, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()
  const { drillToCost } = useDrillDownActions()

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
  const [localSearch, setLocalSearch] = useState('')

  // Persist provider overrides to localStorage
  useEffect(() => {
    if (Object.keys(clusterProviderOverrides).length > 0) {
      localStorage.setItem(PROVIDER_OVERRIDES_KEY, JSON.stringify(clusterProviderOverrides))
    } else {
      localStorage.removeItem(PROVIDER_OVERRIDES_KEY)
    }
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
  }, [detectedProvider, config?.provider])

  // Apply global filters and local search
  const clusters = useMemo(() => {
    let result = allClusters

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter, localSearch])

  // Get pricing from selected provider or custom config
  const pricing = CLOUD_PRICING[selectedProvider]
  const cpuCost = config?.cpuCostPerHour ?? pricing.cpu
  const memoryCost = config?.memoryCostPerGBHour ?? pricing.memory
  const gpuCost = config?.gpuCostPerHour ?? pricing.gpu

  const gpuByCluster = useMemo(() => {
    const map: Record<string, number> = {}
    gpuNodes.forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
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

  // Get per-cluster detected providers for the UI
  const clusterProviders = useMemo(() => {
    const map: Record<string, CloudProvider> = {}
    clusters.forEach(cluster => {
      map[cluster.name] = getClusterProvider(cluster.name, cluster.context)
    })
    return map
  }, [clusters, getClusterProvider])

  const clusterCosts = useMemo(() => {
    return clusters.map(cluster => {
      const cpus = cluster.cpuCores || 0
      const memory = 32 * (cluster.nodeCount || 0) // Estimate 32GB per node
      const gpus = gpuByCluster[cluster.name] || 0

      // Get per-cluster pricing
      const provider = clusterProviders[cluster.name] || 'estimate'
      const clusterPricing = CLOUD_PRICING[provider]
      const clusterCpuCost = config?.cpuCostPerHour ?? clusterPricing.cpu
      const clusterMemoryCost = config?.memoryCostPerGBHour ?? clusterPricing.memory
      const clusterGpuCost = config?.gpuCostPerHour ?? clusterPricing.gpu

      const hourly = (cpus * clusterCpuCost) + (memory * clusterMemoryCost) + (gpus * clusterGpuCost)
      const daily = hourly * 24
      const monthly = daily * 30

      return {
        name: cluster.name,
        healthy: cluster.healthy,
        cpus,
        memory,
        gpus,
        hourly,
        daily,
        monthly,
        provider,
      }
    }).sort((a, b) => b.monthly - a.monthly)
  }, [clusters, gpuByCluster, clusterProviders, config])

  const totalMonthly = clusterCosts.reduce((sum, c) => sum + c.monthly, 0)
  const totalDaily = clusterCosts.reduce((sum, c) => sum + c.daily, 0)

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-muted-foreground">Cluster Costs</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Info button */}
          <button
            onClick={() => setShowRatesInfo(!showRatesInfo)}
            className={`p-1 rounded transition-colors ${showRatesInfo ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-muted-foreground'}`}
            title="View pricing rates"
          >
            <Info className="w-4 h-4" />
          </button>
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Pricing Mode and Provider Selector */}
      <div className="flex items-center justify-between gap-2 mb-3">
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
              title="Pricing settings"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{pricingMode === 'per-cluster' ? 'Per-Cluster' : 'Uniform'}</span>
            </button>
            {showSettingsMenu && (
              <div className="absolute top-full left-0 mt-1 w-52 bg-card border border-border rounded-lg shadow-lg z-20 py-2">
                <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Pricing Mode
                </div>
                <button
                  onClick={() => {
                    setPricingMode('per-cluster')
                    setShowSettingsMenu(false)
                  }}
                  className={`w-full px-3 py-2 text-xs text-left hover:bg-secondary transition-colors flex items-center justify-between ${
                    pricingMode === 'per-cluster' ? 'text-purple-400 bg-purple-500/10' : 'text-foreground'
                  }`}
                >
                  <div>
                    <div className="font-medium">Per-Cluster</div>
                    <div className="text-[10px] text-muted-foreground">Auto-detect vendor per cluster</div>
                  </div>
                  {pricingMode === 'per-cluster' && <Sparkles className="w-3.5 h-3.5 text-yellow-400" />}
                </button>
                <button
                  onClick={() => {
                    setPricingMode('uniform')
                    setShowSettingsMenu(false)
                  }}
                  className={`w-full px-3 py-2 text-xs text-left hover:bg-secondary transition-colors flex items-center justify-between ${
                    pricingMode === 'uniform' ? 'text-purple-400 bg-purple-500/10' : 'text-foreground'
                  }`}
                >
                  <div>
                    <div className="font-medium">Uniform</div>
                    <div className="text-[10px] text-muted-foreground">Same vendor for all clusters</div>
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
                  <span title="Auto-detected from cluster names"><Sparkles className="w-3 h-3 text-yellow-400" /></span>
                )}
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${showProviderMenu ? 'rotate-180' : ''}`} />
              </button>
              {showProviderMenu && (
                <div className="absolute top-full left-0 mt-1 w-44 bg-card border border-border rounded-lg shadow-lg z-10 py-1">
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
                        <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400">detected</span>
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
              <span>Auto-detecting vendors</span>
            </div>
          )}
        </div>

        {/* Provider link (uniform mode only) */}
        {pricingMode === 'uniform' && selectedProvider !== 'estimate' && pricing.pricingUrl && (
          <a
            href={pricing.pricingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            title={`View ${pricing.name} pricing`}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Rates Info Panel */}
      {showRatesInfo && (
        <div className="mb-3 p-3 rounded-lg bg-secondary/30 border border-border/50 text-xs">
          {pricingMode === 'uniform' ? (
            // Uniform mode - show single provider rates
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-foreground">{pricing.name} Pricing Rates</span>
                {pricing.pricingUrl && (
                  <a
                    href={pricing.pricingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <span>View pricing</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="p-2 rounded bg-secondary/50">
                  <p className="text-muted-foreground mb-0.5">CPU</p>
                  <p className="text-foreground font-medium">${cpuCost.toFixed(3)}/hr</p>
                  <p className="text-[10px] text-muted-foreground">per vCPU</p>
                </div>
                <div className="p-2 rounded bg-secondary/50">
                  <p className="text-muted-foreground mb-0.5">Memory</p>
                  <p className="text-foreground font-medium">${memoryCost.toFixed(4)}/hr</p>
                  <p className="text-[10px] text-muted-foreground">per GB</p>
                </div>
                <div className="p-2 rounded bg-secondary/50">
                  <p className="text-muted-foreground mb-0.5">GPU</p>
                  <p className="text-foreground font-medium">${gpuCost.toFixed(2)}/hr</p>
                  <p className="text-[10px] text-muted-foreground">per GPU</p>
                </div>
              </div>
              <p className="text-muted-foreground italic">{pricing.notes}</p>
            </>
          ) : (
            // Per-cluster mode - show all providers' rates
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-foreground">Per-Cluster Pricing Rates</span>
                <span className="text-muted-foreground">(Click badges to change)</span>
              </div>
              <div className="space-y-2">
                {(Object.keys(CLOUD_PRICING) as CloudProvider[]).filter(p => p !== 'estimate').map(provider => {
                  const p = CLOUD_PRICING[provider]
                  const icon = PROVIDER_ICONS[provider]
                  const count = clusterCosts.filter(c => c.provider === provider).length
                  if (count === 0 && !showRatesInfo) return null
                  return (
                    <div key={provider} className={`flex items-center gap-2 p-1.5 rounded ${count > 0 ? 'bg-secondary/50' : 'opacity-50'}`}>
                      <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${icon.bg} ${icon.color}`}>
                        {icon.short}
                      </span>
                      <span className="flex-1 text-foreground">{p.name}</span>
                      <span className="text-muted-foreground">
                        CPU ${p.cpu.toFixed(3)} • Mem ${p.memory.toFixed(4)} • GPU ${p.gpu.toFixed(2)}
                      </span>
                      {count > 0 && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">
                          {count}
                        </span>
                      )}
                      {p.pricingUrl && (
                        <a
                          href={p.pricingUrl}
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

      {/* Local Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search clusters..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Total costs */}
      <div className="p-4 rounded-lg bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-green-400 mb-1">Estimated Monthly</p>
            <p className="text-2xl font-bold text-foreground">${totalMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">Daily</p>
            <p className="text-lg font-medium text-foreground">${totalDaily.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      {/* Per-cluster breakdown */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {clusterCosts.map((cluster) => {
          const percent = totalMonthly > 0 ? (cluster.monthly / totalMonthly) * 100 : 0
          const providerIcon = PROVIDER_ICONS[cluster.provider]
          const providerPricing = CLOUD_PRICING[cluster.provider]
          const isOverridden = clusterProviderOverrides[cluster.name] !== undefined
          return (
            <div
              key={cluster.name}
              onClick={() => drillToCost(cluster.name, {
                cpus: cluster.cpus,
                memory: cluster.memory,
                gpus: cluster.gpus,
                hourly: cluster.hourly,
                daily: cluster.daily,
                monthly: cluster.monthly,
                provider: cluster.provider,
              })}
              className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {/* 1. Server icon */}
                  <Server className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  {/* 2. Vendor logo icon */}
                  <div className="flex-shrink-0" title={providerPricing.name}>
                    <CloudProviderIcon provider={mapProviderToIconProvider(cluster.provider)} size={16} />
                  </div>
                  {/* 3. Text badge (clickable to change) - styled as obvious dropdown button */}
                  <button
                    className={`group/badge px-1.5 py-0.5 text-[9px] font-medium rounded flex-shrink-0 flex items-center gap-0.5 ${providerIcon.bg} ${providerIcon.color} ${
                      isOverridden
                        ? 'ring-1 ring-purple-500/50'
                        : ''
                    } hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-sm hover:shadow`}
                    title={`${providerPricing.name}${isOverridden ? ' (manually set)' : pricingMode === 'per-cluster' ? ' (auto-detected)' : ''}\nClick to change • Right-click to reset`}
                    onClick={(e) => {
                      e.stopPropagation()
                      // Cycle through providers
                      const providers: CloudProvider[] = ['estimate', 'aws', 'gcp', 'azure', 'oci', 'openshift']
                      const currentIdx = providers.indexOf(cluster.provider)
                      const nextProvider = providers[(currentIdx + 1) % providers.length]
                      setClusterProviderOverrides(prev => ({
                        ...prev,
                        [cluster.name]: nextProvider
                      }))
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      // Right-click to clear override and use auto-detection
                      if (clusterProviderOverrides[cluster.name]) {
                        setClusterProviderOverrides(prev => {
                          const next = { ...prev }
                          delete next[cluster.name]
                          return next
                        })
                      }
                    }}
                  >
                    {providerIcon.short}
                    <ChevronDown className="w-2.5 h-2.5 opacity-60 group-hover/badge:opacity-100 transition-opacity" />
                  </button>
                  {/* 4. Cluster name */}
                  <span className="text-sm font-medium text-foreground truncate">{cluster.name}</span>
                  {/* 5. Health dot */}
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cluster.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-green-400 flex-shrink-0">
                    ${cluster.monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
              </div>

              {/* Cost bar */}
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>

              {/* Resource breakdown */}
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  {cluster.cpus} CPUs
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  {cluster.memory}GB
                </span>
                {cluster.gpus > 0 && (
                  <span className="flex items-center gap-1 text-purple-400">
                    <Cpu className="w-3 h-3" />
                    {cluster.gpus} GPUs
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border/50 space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {pricingMode === 'uniform' ? (
              <>
                <span>Based on {pricing.name} rates</span>
                {pricing.pricingUrl && (
                  <a
                    href={pricing.pricingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 transition-colors"
                    title="View official pricing"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </>
            ) : (
              <>
                <span>Mixed pricing:</span>
                {/* Show unique providers used */}
                {Array.from(new Set(clusterCosts.map(c => c.provider))).map(provider => {
                  const count = clusterCosts.filter(c => c.provider === provider).length
                  const icon = PROVIDER_ICONS[provider]
                  return (
                    <span
                      key={provider}
                      className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${icon.bg} ${icon.color}`}
                      title={`${count} cluster${count > 1 ? 's' : ''} using ${CLOUD_PRICING[provider].name}`}
                    >
                      {icon.short} ({count})
                    </span>
                  )
                })}
              </>
            )}
          </div>
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {clusters.length} clusters
          </span>
        </div>
        {/* Estimation methodology links */}
        <div className="flex items-center justify-center gap-3 pt-1 text-[10px]">
          <a
            href="https://www.finops.org/introduction/what-is-finops/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/70 hover:text-purple-400 transition-colors"
            title="Learn about cloud cost management"
          >
            FinOps Foundation
          </a>
          <span className="text-muted-foreground/30">•</span>
          <a
            href="https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/70 hover:text-purple-400 transition-colors"
            title="Learn about Kubernetes resource management"
          >
            K8s Resource Mgmt
          </a>
          <span className="text-muted-foreground/30">•</span>
          <a
            href="https://www.opencost.io/docs/specification"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/70 hover:text-purple-400 transition-colors"
            title="OpenCost cost allocation specification"
          >
            OpenCost Spec
          </a>
        </div>
      </div>
    </div>
  )
}
