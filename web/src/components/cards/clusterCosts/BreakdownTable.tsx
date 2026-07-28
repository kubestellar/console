import { memo, Dispatch, SetStateAction, CSSProperties } from 'react'
import { Server, Cpu, HardDrive, ChevronRight, ChevronDown } from 'lucide-react'
import { CloudProviderIcon, type CloudProvider as IconProvider } from '../../ui/CloudProviderIcon'
import { useTranslation } from 'react-i18next'
import { PROVIDER_ICONS, CLOUD_PRICING } from './FilterBar'

type CloudProvider = 'estimate' | 'aws' | 'gcp' | 'azure' | 'oci' | 'openshift'

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

interface BreakdownTableProps {
  clusterCosts: ClusterCostItem[]
  containerRef: React.RefObject<HTMLDivElement>
  containerStyle: CSSProperties
  totalMonthly: number
  clusterProviderOverrides: Record<string, CloudProvider>
  setClusterProviderOverrides: Dispatch<SetStateAction<Record<string, CloudProvider>>>
  pricingMode: 'uniform' | 'per-cluster'
  onClusterClick: (cluster: ClusterCostItem) => void
}

export const BreakdownTable = memo(function BreakdownTable({
  clusterCosts,
  containerRef,
  containerStyle,
  totalMonthly,
  clusterProviderOverrides,
  setClusterProviderOverrides,
  pricingMode,
  onClusterClick }: BreakdownTableProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div ref={containerRef} className="flex-1 space-y-2 overflow-y-auto" style={containerStyle}>
      {clusterCosts.map((cluster) => {
        const percent = totalMonthly > 0 ? (cluster.monthly / totalMonthly) * 100 : 0
        const providerIcon = PROVIDER_ICONS[cluster.provider]
        const providerPricing = CLOUD_PRICING[cluster.provider]
        const isOverridden = clusterProviderOverrides[cluster.name] !== undefined
        return (
          <div
            key={cluster.name}
            onClick={() => onClusterClick(cluster)}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group cursor-pointer"
          >
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* 1. Server icon */}
                <Server className="w-4 h-4 text-muted-foreground shrink-0" />
                {/* 2. Vendor logo icon */}
                <div className="shrink-0" title={providerPricing.name}>
                  <CloudProviderIcon provider={mapProviderToIconProvider(cluster.provider)} size={16} />
                </div>
                {/* 3. Text badge (clickable to change) - styled as obvious dropdown button */}
                <button
                  className={`group/badge px-1.5 py-0.5 text-[9px] font-medium rounded shrink-0 flex items-center gap-0.5 ${providerIcon.bg} ${providerIcon.color} ${
                    isOverridden
                      ? 'ring-1 ring-purple-500/50'
                      : ''
                  } hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-xs hover:shadow-sm`}
                  title={`${providerPricing.name}${isOverridden ? ` (${t('cards:clusterCosts.manuallySet')})` : pricingMode === 'per-cluster' ? ` (${t('cards:clusterCosts.autoDetected')})` : ''}\n${t('cards:clusterCosts.clickToChange')}`}
                  aria-label={t('cards:clusterCosts.changeProviderPricing', { cluster: cluster.name, provider: providerPricing.name })}
                  onClick={(e) => {
                    e.stopPropagation()
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
                <span className="text-sm font-medium text-foreground truncate min-w-0">{cluster.name}</span>
                {/* 5. Health dot */}
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cluster.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-medium text-green-400 shrink-0">
                  ${cluster.monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
            </div>

            {/* Cost bar */}
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-linear-to-r from-green-500 to-green-500 rounded-full transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>

            {/* Resource breakdown */}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                {t('cards:clusterCosts.cpuCount', { count: cluster.cpus })}
              </span>
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                {t('cards:clusterCosts.memoryGB', { value: cluster.memory })}
              </span>
              {cluster.gpus > 0 && (
                <span className="flex items-center gap-1 text-purple-400">
                  <Cpu className="w-3 h-3" />
                  {t('cards:clusterCosts.gpuCount', { count: cluster.gpus })}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
})
