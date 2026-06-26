import { Bug, ChevronDown, ChevronRight, Maximize2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { CardActionMenu, type CardActionMenuProps } from './card-wrapper/CardActionMenu'

// CardWrapper owns useCardLoadingState and passes the derived state into this presentational helper.

export interface CardToolbarProps extends CardActionMenuProps {
  title: string
  isCollapsed: boolean
  onToggleCollapse: () => void
  onRefresh?: () => void
  isRefreshDisabled: boolean
  isRefreshSpinning: boolean
  isFailed: boolean
  consecutiveFailures: number
  onExpandFullscreen: () => void
  onOpenBugReport: () => void
}

export function CardToolbar({
  title,
  isCollapsed,
  onToggleCollapse,
  onRefresh,
  isRefreshDisabled,
  isRefreshSpinning,
  isFailed,
  consecutiveFailures,
  onExpandFullscreen,
  onOpenBugReport,
  cardId,
  cardType,
  cardWidth,
  cardHeight,
  onConfigure,
  onRemove,
  onWidthChange,
  onHeightChange,
  onShowWidgetExport,
}: CardToolbarProps) {
  const { t } = useTranslation('cards')

  return (
    <div className="flex shrink-0 items-center gap-1.5" role="toolbar" aria-label={t('cardWrapper.cardControls', { title })}>
      <button
        onClick={onToggleCollapse}
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        aria-label={isCollapsed ? t('cardWrapper.expandCard') : t('cardWrapper.collapseCard')}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? t('cardWrapper.expandCard') : t('cardWrapper.collapseCard')}
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </button>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshDisabled}
          className={cn(
            'rounded-lg p-1.5 transition-colors',
            isRefreshDisabled
              ? 'cursor-not-allowed text-blue-400'
              : isFailed
                ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
          )}
          aria-label={isFailed ? t('cardWrapper.refreshFailedRetry', { count: consecutiveFailures }) : t('cardWrapper.refreshData')}
          title={isFailed ? t('cardWrapper.refreshFailedRetry', { count: consecutiveFailures }) : t('cardWrapper.refreshData')}
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshSpinning && 'animate-spin')} aria-hidden="true" />
        </button>
      )}
      <button
        onClick={onExpandFullscreen}
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        aria-label={t('cardWrapper.expandFullScreen')}
        title={t('cardWrapper.expandFullScreen')}
      >
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        onClick={onOpenBugReport}
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        aria-label={t('cardWrapper.reportIssue')}
        title={t('cardWrapper.reportIssue')}
      >
        <Bug className="h-4 w-4" aria-hidden="true" />
      </button>
      <CardActionMenu
        cardId={cardId}
        cardType={cardType}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        onConfigure={onConfigure}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        onHeightChange={onHeightChange}
        onShowWidgetExport={onShowWidgetExport}
      />
    </div>
  )
}
