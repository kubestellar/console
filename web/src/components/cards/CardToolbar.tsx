import { Bug, ChevronDown, ChevronRight, Maximize2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { CardActionMenu, type CardActionMenuProps } from './card-wrapper/CardActionMenu'
import { Button } from '../ui/Button'

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
      <Button
        onClick={onToggleCollapse}
        variant="ghost"
        size="sm"
        icon={isCollapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        aria-label={isCollapsed ? t('cardWrapper.expandCard') : t('cardWrapper.collapseCard')}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? t('cardWrapper.expandCard') : t('cardWrapper.collapseCard')}
      />
      {onRefresh && (
        <Button
          onClick={onRefresh}
          disabled={isRefreshDisabled}
          variant="ghost"
          size="sm"
          icon={<RefreshCw className={cn('h-4 w-4', isRefreshSpinning && 'animate-spin')} aria-hidden="true" />}
          className={cn(
            isFailed && !isRefreshDisabled && 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
          )}
          aria-label={isFailed ? t('cardWrapper.refreshFailedRetry', { count: consecutiveFailures }) : t('cardWrapper.refreshData')}
          title={isFailed ? t('cardWrapper.refreshFailedRetry', { count: consecutiveFailures }) : t('cardWrapper.refreshData')}
        />
      )}
      <Button
        onClick={onExpandFullscreen}
        variant="ghost"
        size="sm"
        icon={<Maximize2 className="h-4 w-4" aria-hidden="true" />}
        aria-label={t('cardWrapper.expandFullScreen')}
        title={t('cardWrapper.expandFullScreen')}
      />
      <Button
        onClick={onOpenBugReport}
        variant="ghost"
        size="sm"
        icon={<Bug className="h-4 w-4" aria-hidden="true" />}
        aria-label={t('cardWrapper.reportIssue')}
        title={t('cardWrapper.reportIssue')}
      />
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
