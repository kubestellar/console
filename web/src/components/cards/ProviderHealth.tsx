import { ExternalLink, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useProviderHealth, ProviderHealthInfo } from '../../hooks/useProviderHealth'
import { SkeletonList } from '../ui/Skeleton'
import { AgentIcon } from '../agent/AgentIcon'
import { CloudProviderIcon } from '../ui/CloudProviderIcon'
import type { CloudProvider } from '../ui/CloudProviderIcon'
import { cn } from '../../lib/cn'
import { useCardLoadingState } from './CardDataContext'
import { ROUTES } from '../../config/routes'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'

const STATUS_COLORS: Record<ProviderHealthInfo['status'], string> = {
  operational: 'bg-green-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
  unknown: 'bg-gray-400',
}

const STATUS_LABEL_KEYS = {
  operational: 'providerHealth.operational',
  degraded: 'providerHealth.degraded',
  down: 'providerHealth.down',
  unknown: 'common:common.unknown',
} as const satisfies Record<ProviderHealthInfo['status'], string>

const PROVIDER_ROW_CONTAINER_STYLE = { containerType: 'inline-size' } as const

function ProviderRow({ provider, onConfigure }: { provider: ProviderHealthInfo; onConfigure?: () => void }) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div
      className="@container flex flex-wrap items-start gap-2 rounded-lg px-1 py-2 transition-colors hover:bg-secondary/30 @lg:flex-nowrap @lg:items-center"
      style={PROVIDER_ROW_CONTAINER_STYLE}
    >
      <div className="shrink-0 pt-0.5 @lg:pt-0">
        {provider.category === 'ai' ? (
          <AgentIcon provider={provider.id} className="w-5 h-5" />
        ) : (
          <CloudProviderIcon provider={provider.id as CloudProvider} size={20} />
        )}
      </div>

      <div className="min-w-0 flex-1 basis-[10rem]">
        <div className="text-sm font-medium text-foreground truncate">{provider.name}</div>
        {provider.detail && (
          <div className="text-xs text-muted-foreground truncate">{provider.detail}</div>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
          <div className={cn('w-2 h-2 rounded-full', STATUS_COLORS[provider.status])} />
          <span className="text-xs text-muted-foreground">{String(t(STATUS_LABEL_KEYS[provider.status]))}</span>
          {!provider.configured && (
            <StatusBadge color="yellow" size="xs" rounded="full">
              {t('providerHealth.noKey')}
            </StatusBadge>
          )}
        </div>

        {!provider.configured && onConfigure && (
          <button
            onClick={(e) => { e.stopPropagation(); onConfigure() }}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-purple-500/20 hover:text-purple-400"
            title={t('providerHealth.configureInSettings')}
            aria-label={t('providerHealth.configureInSettings')}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}

        {provider.statusUrl && (
          <a
            href={sanitizeUrl(provider.statusUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
            title={t('providerHealth.viewStatusPage')}
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

export function ProviderHealth() {
  const { t } = useTranslation(['cards', 'common'])
  const { aiProviders, cloudProviders, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures } = useProviderHealth()
  const navigate = useNavigate()

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const hasData = aiProviders.length > 0 || cloudProviders.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })

  const goToSettings = () => navigate(ROUTES.SETTINGS)

  if (isLoading && !hasData) {
    return <SkeletonList items={5} />
  }

  const hasAny = aiProviders.length > 0 || cloudProviders.length > 0

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <p className="text-sm">{t('providerHealth.noProviders')}</p>
        <p className="text-xs mt-1">
          <button onClick={goToSettings} className="text-purple-400 hover:underline" aria-label={t('providerHealth.configureAIKeys')}>
            {t('providerHealth.configureAIKeys')}
          </button>
          {' '}{t('providerHealth.orConnectClusters')}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1">
      <div className="space-y-4">
        {/* AI Providers */}
        {aiProviders.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {t('providerHealth.aiProviders')}
            </h3>
            <div className="space-y-0.5">
              {aiProviders.map(p => (
                <ProviderRow key={p.id} provider={p} onConfigure={goToSettings} />
              ))}
            </div>
          </div>
        )}

        {/* Cloud Providers */}
        {cloudProviders.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {t('providerHealth.cloudProviders')}
            </h3>
            <div className="space-y-0.5">
              {cloudProviders.map(p => (
                <ProviderRow key={p.id} provider={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
