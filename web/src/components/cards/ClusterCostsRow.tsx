// Per-cluster cost breakdown row for the ClusterCosts card.
// Extracted from ClusterCosts.tsx (issue #21615) — markup unchanged.
import { Server, Cpu, HardDrive, ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CloudProviderIcon } from '../ui/CloudProviderIcon'
import {
  CLOUD_PRICING,
  PROVIDER_ICONS,
  mapProviderToIconProvider,
  type CloudProvider,
  type ClusterCostItem,
  type PricingMode,
} from './ClusterCosts.constants'

/** Provider cycle order used by the inline provider badge. */
const PROVIDER_CYCLE: CloudProvider[] = ['estimate', 'aws', 'gcp', 'azure', 'oci', 'openshift']

interface ClusterCostsRowProps {
  cluster: ClusterCostItem
  totalMonthly: number
  pricingMode: PricingMode
  isOverridden: boolean
  isDemoData?: boolean
  onDrillDown: (cluster: ClusterCostItem) => void
  onCycleProvider: (clusterName: string, next: CloudProvider) => void
  onClearOverride: (clusterName: string) => void
}

export function ClusterCostsRow({
  cluster,
  totalMonthly,
  pricingMode,
  isOverridden,
  isDemoData,
  onDrillDown,
  onCycleProvider,
  onClearOverride,
}: ClusterCostsRowProps) {
  const { t } = useTranslation(['cards', 'common'])

  const percent = totalMonthly > 0 ? (cluster.monthly / totalMonthly) * 100 : 0
  const providerIcon = PROVIDER_ICONS[cluster.provider]
  const providerPricing = CLOUD_PRICING[cluster.provider]

  return (
    <div
      onClick={() => onDrillDown(cluster)}
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
              // Cycle through providers
              const currentIdx = PROVIDER_CYCLE.indexOf(cluster.provider)
              const nextProvider = PROVIDER_CYCLE[(currentIdx + 1) % PROVIDER_CYCLE.length]
              onCycleProvider(cluster.name, nextProvider)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              // Right-click to clear override and use auto-detection
              onClearOverride(cluster.name)
            }}
          >
            {providerIcon.short}
            <ChevronDown className="w-2.5 h-2.5 opacity-60 group-hover/badge:opacity-100 transition-opacity" />
          </button>
          {/* 4. Cluster name */}
          <span className="text-sm font-medium text-foreground truncate min-w-0">{cluster.name}</span>
          {/* 5. Health dot */}
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDemoData ? 'bg-blue-400' : cluster.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
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
}
