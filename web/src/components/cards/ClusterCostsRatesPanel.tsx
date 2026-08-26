// Pricing-rates info panel for the ClusterCosts card.
// Extracted from ClusterCosts.tsx (issue #21615) — markup unchanged.
// Pure UI sub-component — renders props (pricing/costs) provided by the parent;
// no data fetching. Demo data support provided by ClusterCosts.tsx.
import { ExternalLink, RefreshCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { cn } from '../../lib/cn'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import {
  CLOUD_PRICING,
  PROVIDER_ICONS,
  type CloudPricing,
  type CloudProvider,
  type PricingMode,
} from './ClusterCosts.constants'

interface ClusterCostsRatesPanelProps {
  showRatesInfo: boolean
  isRefreshing?: boolean
  pricingMode: PricingMode
  pricing: CloudPricing
  selectedProvider: CloudProvider
  cpuCost: number
  memoryCost: number
  gpuCost: number
  providerBreakdown: Record<string, number>
}

export function ClusterCostsRatesPanel({
  showRatesInfo,
  isRefreshing = false,
  pricingMode,
  pricing,
  selectedProvider,
  cpuCost,
  memoryCost,
  gpuCost,
  providerBreakdown,
}: ClusterCostsRatesPanelProps) {
  const { t } = useTranslation(['cards', 'common'])

  if (!showRatesInfo) return null

  return (
    <div className="mb-3 p-3 rounded-lg bg-secondary/30 border border-border/50 text-xs">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-medium text-foreground">
          {pricingMode === 'uniform'
            ? t('cards:clusterCosts.pricingRates', { provider: pricing.name })
            : t('cards:clusterCosts.perClusterPricingRates')}
        </span>
        <span className="text-muted-foreground flex items-center gap-1">
          <RefreshCcw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} aria-hidden="true" />
          {t('common:refreshing')}
        </span>
      </div>
      {pricingMode === 'uniform' ? (
        // Uniform mode - show single provider rates
        <>
          <div className="flex flex-wrap items-center justify-end gap-y-2 mb-2">
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
        // Per-cluster mode - show all providers' rates
        <>
          <div className="flex items-center justify-end mb-2">
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
  )
}
