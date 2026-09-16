/**
 * CardStateViews - Loading/empty/error state views for UnifiedCard
 *
 * Extracted from UnifiedCard.tsx to keep the composition root focused on
 * data flow. Pure presentational components with no data-fetching logic.
 */

import {
  AlertTriangle,
  Info,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  XCircle,
  HelpCircle,
  type LucideIcon } from 'lucide-react'
import type { UnifiedCardConfig } from '../../types'

/**
 * Loading state component with skeleton rows
 * Note: The refresh icon in the card header animates while this is shown
 */
export function LoadingState({
  config }: {
  config?: UnifiedCardConfig['loadingState']
}) {
  const rows = config?.rows ?? 3
  const showSearch = config?.showSearch ?? true
  const showHeader = config?.showHeader ?? false

  return (
    <div className="p-2 space-y-2">
      {/* Header skeleton */}
      {showHeader && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-secondary/60 rounded-full animate-pulse" />
            <div className="h-4 bg-secondary/60 rounded w-24 animate-pulse" />
          </div>
          <RefreshCw className="w-4 h-4 text-muted-foreground/40 animate-spin" />
        </div>
      )}

      {/* Search skeleton */}
      {showSearch && (
        <div className="h-8 bg-secondary/60 rounded w-full animate-pulse" />
      )}

      {/* Content rows skeleton */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-4 bg-secondary/60 rounded w-16 animate-pulse" />
          <div className="h-4 bg-secondary/60 rounded flex-1 animate-pulse" />
          <div className="h-4 bg-secondary/60 rounded w-20 animate-pulse" />
        </div>
      ))}
    </div>
  )
}

/**
 * Icon lookup map for common icon names
 * Supports kebab-case icon names (e.g., 'info', 'alert-triangle', 'check-circle')
 */
const ICON_MAP: Record<string, LucideIcon> = {
  info: Info,
  'alert-triangle': AlertTriangle,
  'alert-circle': AlertCircle,
  'check-circle': CheckCircle,
  'x-circle': XCircle,
  'help-circle': HelpCircle }

/**
 * Get icon component by name (case-insensitive, kebab-case format)
 */
function getIconComponent(iconName?: string): LucideIcon {
  if (!iconName?.trim()) return Info
  return ICON_MAP[iconName.toLowerCase()] ?? Info
}

/**
 * Empty state component
 */
export function EmptyState({
  config }: {
  config?: UnifiedCardConfig['emptyState']
}) {
  const title = config?.title ?? 'No data'
  const message = config?.message
  const variant = config?.variant ?? 'neutral'
  const IconComponent = getIconComponent(config?.icon)

  const variantColors = {
    success: 'text-green-400',
    info: 'text-blue-400',
    warning: 'text-yellow-400',
    neutral: 'text-muted-foreground' }

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <div className={`mb-2 ${variantColors[variant]}`}>
        <IconComponent className="w-8 h-8" />
      </div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      {message && (
        <div className="text-xs text-muted-foreground mt-1">{message}</div>
      )}
    </div>
  )
}

/**
 * Error state component
 */
export function ErrorState({
  message,
  onRetry }: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
      <div className="text-sm font-medium text-foreground">Error loading data</div>
      <div className="text-xs text-muted-foreground mt-1">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          aria-label="Retry loading data"
          className="mt-3 px-3 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}
