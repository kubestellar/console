// Footer (pricing attribution + methodology links) for the ClusterCosts card.
// Extracted from ClusterCosts.tsx (issue #21615) — markup unchanged.
import { ExternalLink, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import {
  CLOUD_PRICING,
  PROVIDER_ICONS,
  type CloudPricing,
  type CloudProvider,
  type PricingMode,
} from './ClusterCosts.constants'

const FINOPS_URL = 'https://www.finops.org/introduction/what-is-finops/'
const K8S_RESOURCES_URL = 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/'
const OPENCOST_SPEC_URL = 'https://www.opencost.io/docs/specification'

interface ClusterCostsFooterProps {
  pricingMode: PricingMode
  pricing: CloudPricing
  uniqueProviders: CloudProvider[]
  providerBreakdown: Record<string, number>
  totalItems: number
}

export function ClusterCostsFooter({
  pricingMode,
  pricing,
  uniqueProviders,
  providerBreakdown,
  totalItems,
}: ClusterCostsFooterProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
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
          href={FINOPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground/70 hover:text-purple-400 transition-colors"
          title={t('cards:clusterCosts.cloudCostMgmt')}
        >
          {t('cards:clusterCosts.finOpsFoundation')}
        </a>
        <span className="text-muted-foreground/30">•</span>
        <a
          href={K8S_RESOURCES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground/70 hover:text-purple-400 transition-colors"
          title={t('cards:clusterCosts.k8sResourceMgmt')}
        >
          {t('cards:clusterCosts.k8sResourceMgmtLink')}
        </a>
        <span className="text-muted-foreground/30">•</span>
        <a
          href={OPENCOST_SPEC_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground/70 hover:text-purple-400 transition-colors"
          title={t('cards:clusterCosts.openCostSpec')}
        >
          {t('cards:clusterCosts.openCostSpecLink')}
        </a>
      </div>
    </div>
  )
}
