import { ReactNode, useCallback, useEffect, useState, type ComponentProps } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, FileText, RefreshCw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { shouldShowFailureBanner } from './card-wrapper/badgeVisibility'

const REMOVE_CARD_FAILURE_THRESHOLD = 3

type RetryLabelFactory = NonNullable<ComponentProps<typeof DynamicCardErrorBoundary>['fallbackRetryLabel']>

export interface CardErrorFallbackProps {
  cardId: string
  children: ReactNode
}

export function CardErrorFallback({ cardId, children }: CardErrorFallbackProps) {
  const { t } = useTranslation('cards')
  const getRetryLabel = useCallback<RetryLabelFactory>(
    (retriesLeft) => t('cardWrapper.renderRetryLeft', { count: retriesLeft }),
    [t]
  )

  return (
    <DynamicCardErrorBoundary
      cardId={cardId}
      fallbackTitle={t('cardWrapper.renderErrorTitle')}
      fallbackMessage={t('cardWrapper.renderErrorMessage')}
      fallbackRetryLabel={getRetryLabel}
      fallbackReloadMessage={t('cardWrapper.renderReloadMessage')}
    >
      {children}
    </DynamicCardErrorBoundary>
  )
}

export interface CardFailureBannerProps {
  cardType: string
  isFailed: boolean
  isCollapsed: boolean
  consecutiveFailures: number
  errorMessage?: string
  onRefresh?: () => void
  onRemove?: () => void
  isRefreshing?: boolean
  isVisuallySpinning: boolean
}

export function CardFailureBanner({
  cardType,
  isFailed,
  isCollapsed,
  consecutiveFailures,
  errorMessage,
  onRefresh,
  onRemove,
  isRefreshing,
  isVisuallySpinning,
}: CardFailureBannerProps) {
  const { t } = useTranslation('cards')
  const [showFailureLogs, setShowFailureLogs] = useState(false)

  useEffect(() => {
    if (!isFailed) {
      setShowFailureLogs(false)
    }
  }, [isFailed])

  if (!shouldShowFailureBanner({ cardType, isFailed, isCollapsed })) {
    return null
  }

  return (
    <div className="px-3 pt-2" data-testid="card-failure-banner">
      <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-start gap-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/90" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-amber-200/90">
              {t('cardWrapper.refreshFailedCount', { count: consecutiveFailures })}
            </p>
            {errorMessage && (
              <p className="mt-0.5 truncate text-muted-foreground/90" title={errorMessage}>
                {t('cardWrapper.failureReasonLabel')}: {errorMessage}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {errorMessage && (
              <button
                onClick={() => setShowFailureLogs(prev => !prev)}
                className="no-underline flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground"
                aria-label={showFailureLogs ? t('cardWrapper.hideLogs') : t('cardWrapper.viewLogs')}
                aria-expanded={showFailureLogs}
              >
                <FileText className="h-3 w-3" aria-hidden="true" />
                {showFailureLogs ? t('cardWrapper.hideLogs') : t('cardWrapper.viewLogs')}
                {showFailureLogs
                  ? <ChevronUp className="h-3 w-3" aria-hidden="true" />
                  : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
              </button>
            )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="no-underline flex items-center gap-1 rounded-md border border-amber-500/10 bg-background/30 px-1.5 py-0.5 text-2xs text-amber-200/90 transition-colors hover:bg-background/50 hover:text-amber-100"
                aria-label={t('cardWrapper.failureRetry')}
              >
                <RefreshCw className={cn('h-3 w-3', (isRefreshing || isVisuallySpinning) && 'animate-spin')} aria-hidden="true" />
                {t('cardWrapper.failureRetry')}
              </button>
            )}
            {onRemove && consecutiveFailures >= REMOVE_CARD_FAILURE_THRESHOLD && (
              <button
                onClick={onRemove}
                className="no-underline flex items-center gap-1 rounded-md border border-red-500/10 bg-red-500/5 px-1.5 py-0.5 text-2xs text-red-300/90 transition-colors hover:bg-red-500/10 hover:text-red-200"
                aria-label={t('cardWrapper.removeCardLabel')}
                data-testid="card-remove-button"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                {t('cardWrapper.removeCardButton')}
              </button>
            )}
          </div>
        </div>
        {showFailureLogs && errorMessage && (
          <div className="mt-2 rounded-md border border-amber-500/10 bg-background/30 p-2" data-testid="card-failure-logs">
            <p className="mb-1 text-2xs font-medium text-muted-foreground">
              {t('cardWrapper.failureLogTitle')}
            </p>
            <pre className="text-2xs whitespace-pre-wrap break-all font-mono leading-relaxed text-amber-100/80">
              {errorMessage}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
