import type { ComponentType, ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { cn } from '@/lib/cn'
import { InfoTooltip } from './card-wrapper/InfoTooltip'
import { CardMeta } from './CardMeta'
import { CardToolbar } from './CardToolbar'

interface CardHeaderProps {
  dragHandle?: ReactNode
  resolvedIcon?: ComponentType<{ className?: string }>
  resolvedIconColor: string
  title: string
  description: string
  t: TFunction<['cards', 'common']>
  showDemoIndicator: boolean
  effectiveIsDemoData: boolean
  isLive?: boolean
  effectiveIsFailed: boolean
  effectiveConsecutiveFailures: number
  showHeaderRefreshIndicator: boolean
  effectiveIsLoading: boolean
  isVisuallySpinning: boolean
  effectiveLastUpdated?: Date | null
  isCollapsed: boolean
  onToggleCollapse: () => void
  onRefresh?: () => void
  isRefreshDisabled: boolean
  isRefreshSpinning: boolean
  onExpandFullscreen: () => void
  onOpenBugReport: () => void
  cardId?: string
  cardType: string
  cardWidth?: number
  cardHeight?: number
  onConfigure?: () => void
  onRemove?: () => void
  onWidthChange?: (newWidth: number) => void
  onHeightChange?: (newHeight: number) => void
  onShowWidgetExport: () => void
}

export function CardHeader({
  dragHandle,
  resolvedIcon: ResolvedIcon,
  resolvedIconColor,
  title,
  description,
  t,
  showDemoIndicator,
  effectiveIsDemoData,
  isLive,
  effectiveIsFailed,
  effectiveConsecutiveFailures,
  showHeaderRefreshIndicator,
  effectiveIsLoading,
  isVisuallySpinning,
  effectiveLastUpdated,
  isCollapsed,
  onToggleCollapse,
  onRefresh,
  isRefreshDisabled,
  isRefreshSpinning,
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
}: CardHeaderProps) {
  return (
    <div data-tour="card-header" className="flex flex-wrap items-center justify-between gap-y-2 border-b border-border/50 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {dragHandle}
        {ResolvedIcon && <ResolvedIcon className={cn('h-4 w-4 shrink-0', resolvedIconColor)} />}
        <h2 className="truncate text-sm font-medium text-foreground">{title}</h2>
        <InfoTooltip text={description || t('messages.descriptionComingSoon', '{{title}} card. Description coming soon.', { title })} />
        <CardMeta
          showDemoIndicator={showDemoIndicator}
          isDemoData={effectiveIsDemoData}
          isLive={isLive}
          isFailed={effectiveIsFailed}
          consecutiveFailures={effectiveConsecutiveFailures}
          showRefreshIndicator={showHeaderRefreshIndicator}
          isLoading={effectiveIsLoading}
          isVisuallySpinning={isVisuallySpinning}
          lastUpdated={effectiveLastUpdated}
        />
      </div>
      <CardToolbar
        title={title}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onRefresh={onRefresh}
        isRefreshDisabled={isRefreshDisabled}
        isRefreshSpinning={isRefreshSpinning}
        isFailed={effectiveIsFailed}
        consecutiveFailures={effectiveConsecutiveFailures}
        onExpandFullscreen={onExpandFullscreen}
        onOpenBugReport={onOpenBugReport}
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
