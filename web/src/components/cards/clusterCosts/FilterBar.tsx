import { memo, Dispatch, SetStateAction } from 'react'
import { Settings2, Sparkles, ChevronDown, ExternalLink } from 'lucide-react'
import { StatusBadge } from '../../ui/StatusBadge'
import { useTranslation } from 'react-i18next'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'

type CloudProvider = 'estimate' | 'aws' | 'gcp' | 'azure' | 'oci' | 'openshift'
type PricingMode = 'uniform' | 'per-cluster'

interface CloudPricing {
  name: string
  cpu: number
  memory: number
  gpu: number
  pricingUrl: string
  notes: string
}

export const PROVIDER_ICONS: Record<CloudProvider, { color: string; bg: string; short: string }> = {
  estimate: { color: 'text-muted-foreground', bg: 'bg-gray-500/20 dark:bg-gray-400/15', short: 'EST' },
  aws: { color: 'text-orange-400', bg: 'bg-orange-500/20', short: 'AWS' },
  gcp: { color: 'text-blue-400', bg: 'bg-blue-500/20', short: 'GCP' },
  azure: { color: 'text-blue-400', bg: 'bg-blue-500/20', short: 'AZR' },
  oci: { color: 'text-red-400', bg: 'bg-red-500/20', short: 'OCI' },
  openshift: { color: 'text-red-500', bg: 'bg-red-600/20', short: 'OCP' } }

export const CLOUD_PRICING: Record<CloudProvider, CloudPricing> = {
  estimate: {
    name: 'Estimate',
    cpu: 0.05,
    memory: 0.01,
    gpu: 2.50,
    pricingUrl: '',
    notes: 'Generic estimates for rough cost calculation' },
  aws: {
    name: 'AWS',
    cpu: 0.048,
    memory: 0.012,
    gpu: 3.06,
    pricingUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/',
    notes: 'Based on US East on-demand pricing' },
  gcp: {
    name: 'GCP',
    cpu: 0.0475,
    memory: 0.0064,
    gpu: 2.48,
    pricingUrl: 'https://cloud.google.com/compute/pricing',
    notes: 'Based on us-central1 on-demand pricing' },
  azure: {
    name: 'Azure',
    cpu: 0.05,
    memory: 0.011,
    gpu: 2.07,
    pricingUrl: 'https://azure.microsoft.com/en-us/pricing/details/virtual-machines/',
    notes: 'Based on East US on-demand pricing' },
  oci: {
    name: 'OCI',
    cpu: 0.025,
    memory: 0.0015,
    gpu: 2.95,
    pricingUrl: 'https://www.oracle.com/cloud/price-list/',
    notes: 'Based on Flex shapes pricing' },
  openshift: {
    name: 'OpenShift',
    cpu: 0.048,
    memory: 0.012,
    gpu: 3.00,
    pricingUrl: 'https://www.redhat.com/en/technologies/cloud-computing/openshift/aws/pricing',
    notes: 'Based on Red Hat OpenShift on AWS (ROSA) pricing' } }

interface FilterBarProps {
  pricingMode: PricingMode
  setPricingMode: Dispatch<SetStateAction<PricingMode>>
  selectedProvider: CloudProvider
  setSelectedProvider: Dispatch<SetStateAction<CloudProvider>>
  showSettingsMenu: boolean
  setShowSettingsMenu: Dispatch<SetStateAction<boolean>>
  showProviderMenu: boolean
  setShowProviderMenu: Dispatch<SetStateAction<boolean>>
  isAutoDetected: boolean
  setIsAutoDetected: Dispatch<SetStateAction<boolean>>
  detectedProvider: CloudProvider | null
  pricing: CloudPricing
}

export const FilterBar = memo(function FilterBar({
  pricingMode,
  setPricingMode,
  selectedProvider,
  setSelectedProvider,
  showSettingsMenu,
  setShowSettingsMenu,
  showProviderMenu,
  setShowProviderMenu,
  isAutoDetected,
  setIsAutoDetected,
  detectedProvider,
  pricing }: FilterBarProps) {
  const { t } = useTranslation(['cards'])

  return (
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
  )
})
