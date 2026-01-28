import React from 'react'
import { RefreshCw, Hourglass } from 'lucide-react'

interface DashboardHeaderProps {
  /** Dashboard title text or ReactNode */
  title: React.ReactNode
  /** Subtitle text below the title */
  subtitle: React.ReactNode
  /** Optional icon rendered before the title */
  icon?: React.ReactNode
  /** Whether the dashboard is currently fetching/refreshing data */
  isFetching: boolean
  /** Called when the refresh button is clicked */
  onRefresh: () => void
  /** Auto-refresh checkbox state */
  autoRefresh?: boolean
  /** Called when auto-refresh checkbox changes */
  onAutoRefreshChange?: (checked: boolean) => void
  /** Unique ID for the auto-refresh checkbox (accessibility) */
  autoRefreshId?: string
  /** Last updated timestamp */
  lastUpdated?: Date | null
  /** Extra content rendered after the hourglass (e.g., alert badges) */
  afterTitle?: React.ReactNode
  /** Extra content rendered on the right side before auto-refresh (e.g., delete button) */
  rightExtra?: React.ReactNode
}

/**
 * Shared dashboard header with consistent layout:
 * LEFT:  [Icon] Title / Subtitle  [Hourglass Updating]  [afterTitle]
 * RIGHT: [rightExtra] [Auto checkbox] [Refresh ↻] [Updated time]
 *
 * All dashboards should use this component to ensure consistent
 * hourglass positioning, refresh controls, and styling.
 */
export function DashboardHeader({
  title,
  subtitle,
  icon,
  isFetching,
  onRefresh,
  autoRefresh,
  onAutoRefreshChange,
  autoRefreshId,
  lastUpdated,
  afterTitle,
  rightExtra,
}: DashboardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      {/* Left side: title + hourglass */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            {icon}
            {title}
          </h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        {isFetching && (
          <span
            className="flex items-center gap-1 text-xs text-amber-400 animate-pulse"
            title="Updating..."
          >
            <Hourglass className="w-3 h-3" />
            <span>Updating</span>
          </span>
        )}
        {afterTitle}
      </div>

      {/* Right side: controls */}
      <div className="flex items-center gap-3">
        {rightExtra}
        {onAutoRefreshChange && (
          <label
            htmlFor={autoRefreshId || 'auto-refresh'}
            className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground"
            title="Auto-refresh every 30s"
          >
            <input
              type="checkbox"
              id={autoRefreshId || 'auto-refresh'}
              checked={autoRefresh ?? false}
              onChange={(e) => onAutoRefreshChange(e.target.checked)}
              className="rounded border-border w-3.5 h-3.5"
            />
            Auto
          </label>
        )}
        <button
          onClick={onRefresh}
          disabled={isFetching}
          className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
          title="Refresh data"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
        {lastUpdated && !isFetching && (
          <span className="text-xs text-muted-foreground">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  )
}
