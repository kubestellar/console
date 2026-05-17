import { ReactNode, Suspense } from 'react'
import { AlertTriangle, Info, RefreshCw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import type { CardDataState } from './CardDataContext'
import { CardErrorFallback } from './CardErrorFallback'
import { InstallCTAFlow } from './card-wrapper/InstallCTAFlow'
import { CardSkeleton, type CardSkeletonProps } from '@/lib/cards/CardComponents'

// CardWrapper owns useCardLoadingState and passes the derived state into this presentational helper.

export interface CardLoadingStateProps {
  cardId: string
  cardType: string
  title: string
  children: ReactNode
  isVisible: boolean
  isExpanded: boolean
  shouldShowSkeleton: boolean
  skeletonType: CardSkeletonProps['type']
  skeletonRows: number
  cardLoadingTimedOut: boolean
  childDataState: CardDataState | null
  onRefresh?: () => void
  onRemove?: () => void
  onLoadingTimeoutRetry?: () => void
  isRefreshing?: boolean
  isVisuallySpinning: boolean
  showInstallCta: boolean
}

export function CardLoadingState({
  cardId,
  cardType,
  title,
  children,
  isVisible,
  isExpanded,
  shouldShowSkeleton,
  skeletonType,
  skeletonRows,
  cardLoadingTimedOut,
  childDataState,
  onRefresh,
  onRemove,
  onLoadingTimeoutRetry,
  isRefreshing,
  isVisuallySpinning,
  showInstallCta,
}: CardLoadingStateProps) {
  const { t } = useTranslation('cards')
  const shouldShowLoadingTimeout = cardLoadingTimedOut && !childDataState?.hasData
  const shouldShowEmptyState = !!childDataState && !childDataState.isLoading && !childDataState.hasData && !cardLoadingTimedOut
  const shouldHideChildren = shouldShowSkeleton || shouldShowLoadingTimeout || shouldShowEmptyState

  if (!(isVisible || isExpanded)) {
    return <CardSkeleton type={skeletonType} rows={skeletonRows} showHeader={false} />
  }

  return (
    <>
      {shouldShowSkeleton && (
        <div data-card-skeleton="true">
          <CardSkeleton type={skeletonType} rows={skeletonRows} showHeader />
        </div>
      )}
      {shouldShowLoadingTimeout && (
        <div className="flex h-full flex-col items-center justify-center p-4 text-center" data-card-loading-timeout="true">
          <AlertTriangle className="mb-2 h-8 w-8 text-amber-400" />
          <p className="mb-1 text-sm font-medium text-foreground">
            {t('cardWrapper.loadingTimedOutTitle')}
          </p>
          <p className="mb-3 max-w-xs text-xs text-muted-foreground">
            {t('cardWrapper.loadingTimedOutMessage')}
          </p>
          {onLoadingTimeoutRetry && (
            <button
              onClick={onLoadingTimeoutRetry}
              className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary/80"
              aria-label={t('cardWrapper.loadingTimedOutRetry')}
            >
              <RefreshCw className={cn('h-3 w-3', (isRefreshing || isVisuallySpinning) && 'animate-spin')} aria-hidden="true" />
              {t('cardWrapper.loadingTimedOutRetry')}
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="mt-2 flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
              aria-label={t('cardWrapper.removeCardButton')}
              data-testid="card-remove-button"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              {t('cardWrapper.removeCardButton')}
            </button>
          )}
        </div>
      )}
      {shouldShowEmptyState && (
        <div className="flex h-full flex-col items-center justify-center p-4 text-center" data-card-empty-state="true">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Info className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mb-1 text-sm font-medium text-foreground">
            {t('cardWrapper.noDataTitle')}
          </p>
          <p className="mb-3 max-w-xs text-xs text-muted-foreground">
            {t('cardWrapper.noDataMessage')}
          </p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary/80"
              aria-label={t('cardWrapper.loadingTimedOutRetry')}
            >
              <RefreshCw className={cn('h-3 w-3', (isRefreshing || isVisuallySpinning) && 'animate-spin')} aria-hidden="true" />
              {t('cardWrapper.loadingTimedOutRetry')}
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="mt-2 flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
              aria-label={t('cardWrapper.removeCardButton')}
              data-testid="card-remove-button"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              {t('cardWrapper.removeCardButton')}
            </button>
          )}
        </div>
      )}
      <div
        className={cn(
          'min-h-0',
          shouldHideChildren ? 'hidden' : 'flex flex-1 flex-col'
        )}
      >
        <CardErrorFallback cardId={cardId}>
          <Suspense fallback={<CardSkeleton type={skeletonType} rows={skeletonRows} showHeader={false} />}>
            {children}
          </Suspense>
        </CardErrorFallback>
      </div>
      {showInstallCta && (
        <InstallCTAFlow cardType={cardType} title={title} />
      )}
    </>
  )
}
