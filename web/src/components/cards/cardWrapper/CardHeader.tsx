import type { ComponentType, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { InfoTooltip } from '../card-wrapper/InfoTooltip'
import { CardMeta } from '../CardMeta'
import { CardResizeHandle } from './CardResizeHandle'
import type { CardToolbarProps } from '../CardToolbar'

interface CardHeaderProps {
  dragHandle?: ReactNode
  ResolvedIcon?: ComponentType<{ className?: string }>
  resolvedIconColor: string
  title: string
  description: string
  showDemoIndicator: boolean
  effectiveIsDemoData: boolean
  isLive?: boolean
  effectiveIsFailed: boolean
  effectiveConsecutiveFailures: number
  showHeaderRefreshIndicator: boolean
  effectiveIsLoading: boolean
  isVisuallySpinning: boolean
  effectiveLastUpdated?: Date | null
  toolbarProps: CardToolbarProps
}

export function CardHeader({
  dragHandle,
  ResolvedIcon,
  resolvedIconColor,
  title,
  description,
  showDemoIndicator,
  effectiveIsDemoData,
  isLive,
  effectiveIsFailed,
  effectiveConsecutiveFailures,
  showHeaderRefreshIndicator,
  effectiveIsLoading,
  isVisuallySpinning,
  effectiveLastUpdated,
  toolbarProps,
}: CardHeaderProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div data-tour="card-header" className="flex flex-wrap items-center justify-between gap-y-2 border-b border-border/50 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {dragHandle}
        {ResolvedIcon && <ResolvedIcon className={cn('h-4 w-4 shrink-0', resolvedIconColor)} />}
        <h2 className="truncate text-sm font-medium text-foreground">{title}</h2>
        <InfoTooltip text={description || t('messages.descriptionComingSoon', { title })} />
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
      <CardResizeHandle {...toolbarProps} />
    </div>
  )
}
