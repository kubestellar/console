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

const STATUS_COLORS: Record<ProviderHealthInfo['status'], string> = {
  operational: 'bg-green-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
  unknown: 'bg-gray-400',
}

const STATUS_LABELS: Record<ProviderHealthInfo['status'], string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
}

function ProviderRow({ provider, onConfigure }: { provider: ProviderHealthInfo; onConfigure?: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-secondary/30 transition-colors">
      {/* Icon */}
      <div className="shrink-0">
        {provider.category === 'ai' ? (
          <AgentIcon provider={provider.id} className="w-5 h-5" />
        ) : (
          <CloudProviderIcon provider={provider.id as CloudProvider} size={20} />
        )}
      </div>

      {/* Name & detail */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{provider.name}</div>
        {provider.detail && (
          <div className="text-xs text-muted-foreground truncate">{provider.detail}</div>
        )}
      </div>

      {/* Status dot + label */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={cn('w-2 h-2 rounded-full', STATUS_COLORS[provider.status])} />
        <span className="text-xs text-muted-foreground">{STATUS_LABELS[provider.status]}</span>
        {!provider.configured && (
          <span className="text-[10px] text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded-full font-medium">
            No Key
          </span>
        )}
      </div>

      {/* Configure link for unconfigured providers */}
      {!provider.configured && onConfigure && (
        <button
          onClick={(e) => { e.stopPropagation(); onConfigure() }}
          className="shrink-0 p-1 hover:bg-purple-500/20 rounded transition-colors text-muted-foreground hover:text-purple-400"
          title="Configure in Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Status page link */}
      {provider.statusUrl && (
        <a
          href={provider.statusUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1 hover:bg-secondary/50 rounded transition-colors text-muted-foreground hover:text-foreground"
          title="View status page"
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  )
}

export function ProviderHealth() {
  const { aiProviders, cloudProviders, isLoading } = useProviderHealth()
  const navigate = useNavigate()

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading,
    hasAnyData: aiProviders.length > 0 || cloudProviders.length > 0,
  })

  const goToSettings = () => navigate(ROUTES.SETTINGS)

  if (isLoading) {
    return <SkeletonList items={5} />
  }

  const hasAny = aiProviders.length > 0 || cloudProviders.length > 0

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <p className="text-sm">No providers detected</p>
        <p className="text-xs mt-1">
          <button onClick={goToSettings} className="text-purple-400 hover:underline">
            Configure AI keys
          </button>
          {' '}or connect clusters to see provider health
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* AI Providers */}
      {aiProviders.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            AI Providers
          </h4>
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
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Cloud Providers
          </h4>
          <div className="space-y-0.5">
            {cloudProviders.map(p => (
              <ProviderRow key={p.id} provider={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
