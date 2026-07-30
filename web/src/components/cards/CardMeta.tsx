import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { formatTimeAgo } from '@/lib/formatters'
import { shouldShowLiveBadge } from './card-wrapper/badgeVisibility'

// CardWrapper owns useCardLoadingState and passes the derived state into this presentational helper.

export interface CardMetaProps {
  showDemoIndicator: boolean
  isDemoData: boolean
  isLive?: boolean
  isFailed: boolean
  consecutiveFailures: number
  showRefreshIndicator: boolean
  isLoading: boolean
  isVisuallySpinning: boolean
  lastUpdated?: Date | null
}

export function CardMeta({
  showDemoIndicator,
  isDemoData,
  isLive,
  isFailed,
  consecutiveFailures,
  showRefreshIndicator,
  isLoading,
  isVisuallySpinning,
  lastUpdated,
}: CardMetaProps) {
  const { t } = useTranslation('cards')

  return (
    <>
      {showDemoIndicator && (
        <span
          data-testid="demo-badge"
          role="status"
          aria-live="polite"
          className="text-2xs shrink-0 rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-400"
          title={isDemoData ? t('cardWrapper.demoBadgeTitle') : t('cardWrapper.demoModeTitle')}
        >
          {t('cardWrapper.demo')}
        </span>
      )}
      {shouldShowLiveBadge({
        isLive,
        showDemoIndicator,
        isFailed,
      }) && (
        <span
          role="status"
          aria-live="polite"
          className="text-2xs shrink-0 rounded bg-green-500/20 px-1.5 py-0.5 text-green-400"
          title={t('cardWrapper.liveBadgeTitle')}
        >
          {t('cardWrapper.live')}
        </span>
      )}
      {isFailed && (
        <span
          role="alert"
          aria-live="assertive"
          className="text-2xs flex shrink-0 items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-red-400"
          title={t('cardWrapper.refreshFailedCount', { count: consecutiveFailures })}
        >
          {t('cardWrapper.refreshFailed')}
        </span>
      )}
      {showRefreshIndicator && !isFailed && (
        <RefreshCw className="h-3 w-3 animate-spin text-blue-400" aria-hidden="true" />
      )}
      {(() => {
        if (isVisuallySpinning || isLoading || !lastUpdated) {
          return null
        }
        const tooltipLabel = isFailed
          ? t('cardWrapper.lastRefreshedStale', { time: lastUpdated.toLocaleString() })
          : t('cardWrapper.lastRefreshed', { time: lastUpdated.toLocaleString() })

        return (
          <span
            className={cn(
              'cursor-help text-2xs',
              isFailed ? 'text-orange-400' : 'text-muted-foreground'
            )}
            title={tooltipLabel}
          >
            {formatTimeAgo(lastUpdated, { compact: true, invalidLabel: t('cardWrapper.unknownTime') })}
          </span>
        )
      })()}
    </>
  )
}
