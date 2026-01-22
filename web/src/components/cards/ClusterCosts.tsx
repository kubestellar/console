import { useMemo, useState } from 'react'
import { DollarSign, Server, Cpu, HardDrive, TrendingUp, Info, ExternalLink, ChevronDown } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { RefreshButton } from '../ui/RefreshIndicator'

type CloudProvider = 'estimate' | 'aws' | 'gcp' | 'azure' | 'oci'

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
}

interface ClusterCostsProps {
  config?: {
    cpuCostPerHour?: number
    memoryCostPerGBHour?: number
    gpuCostPerHour?: number
    provider?: CloudProvider
  }
}

export function ClusterCosts({ config }: ClusterCostsProps) {
  const { clusters: allClusters, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Cloud provider selection
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider>(config?.provider || 'estimate')
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [showRatesInfo, setShowRatesInfo] = useState(false)

  // Apply global filters
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

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

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

  const clusterCosts = useMemo(() => {
    return clusters.map(cluster => {
      const cpus = cluster.cpuCores || 0
      const memory = 32 * (cluster.nodeCount || 0) // Estimate 32GB per node
      const gpus = gpuByCluster[cluster.name] || 0

      const hourly = (cpus * cpuCost) + (memory * memoryCost) + (gpus * gpuCost)
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
      }
    }).sort((a, b) => b.monthly - a.monthly)
  }, [clusters, gpuByCluster, cpuCost, memoryCost, gpuCost])

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

      {/* Cloud Provider Selector */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Pricing:</span>
        <div className="relative">
          <button
            onClick={() => setShowProviderMenu(!showProviderMenu)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs bg-secondary/50 hover:bg-secondary rounded-md border border-border transition-colors"
          >
            <span className="font-medium text-foreground">{pricing.name}</span>
            <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${showProviderMenu ? 'rotate-180' : ''}`} />
          </button>
          {showProviderMenu && (
            <div className="absolute top-full left-0 mt-1 w-32 bg-card border border-border rounded-lg shadow-lg z-10 py-1">
              {(Object.keys(CLOUD_PRICING) as CloudProvider[]).map(provider => (
                <button
                  key={provider}
                  onClick={() => {
                    setSelectedProvider(provider)
                    setShowProviderMenu(false)
                  }}
                  className={`w-full px-3 py-1.5 text-xs text-left hover:bg-secondary transition-colors ${
                    selectedProvider === provider ? 'text-purple-400 bg-purple-500/10' : 'text-foreground'
                  }`}
                >
                  {CLOUD_PRICING[provider].name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rates Info Panel */}
      {showRatesInfo && (
        <div className="mb-3 p-3 rounded-lg bg-secondary/30 border border-border/50 text-xs">
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
        </div>
      )}

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
          return (
            <div
              key={cluster.name}
              className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{cluster.name}</span>
                  <div className={`w-1.5 h-1.5 rounded-full ${cluster.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
                <span className="text-sm font-medium text-green-400">
                  ${cluster.monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
                </span>
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
          <div className="flex items-center gap-1">
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
