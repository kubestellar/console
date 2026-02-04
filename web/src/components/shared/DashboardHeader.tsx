import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw, Hourglass, AlertTriangle } from 'lucide-react'
import { getRememberPosition, setRememberPosition } from '../../hooks/useLastRoute'

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
  /** Override: external lastUpdated timestamp. If omitted, the header
   *  automatically tracks when isFetching transitions false → true → false. */
  lastUpdated?: Date | null
  /** Extra content rendered after the hourglass (e.g., alert badges) */
  afterTitle?: React.ReactNode
  /** Extra content rendered on the right side before auto-refresh (e.g., delete button) */
  rightExtra?: React.ReactNode
  /** Error message to display (optional) */
  error?: string | null
}

/**
 * Shared dashboard header with consistent layout:
 * LEFT:  [Icon] Title / Subtitle  [Hourglass Updating]  [afterTitle]
 * RIGHT: [rightExtra] [Auto checkbox] [Refresh ↻]
 *        Updated X:XX:XX PM
 *
 * The "Updated" timestamp is self-managed: it initializes to "now" on mount
 * and updates automatically whenever isFetching transitions from true→false.
 * Dashboards do NOT need to pass lastUpdated — the header derives it from
 * isFetching. An external lastUpdated prop overrides the internal tracking.
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
  lastUpdated: externalLastUpdated,
  afterTitle,
  rightExtra,
  error,
}: DashboardHeaderProps) {
  const location = useLocation()
  const [rememberPosition, setRememberPositionState] = useState(() => getRememberPosition(location.pathname))

  // Self-managed timestamp: updates when isFetching goes true → false
  const [internalLastUpdated, setInternalLastUpdated] = useState<Date>(() => new Date())
  const wasFetchingRef = useRef(isFetching)

  useEffect(() => {
    if (wasFetchingRef.current && !isFetching) {
      setInternalLastUpdated(new Date())
    }
    wasFetchingRef.current = isFetching
  }, [isFetching])

  // Use external override if it has a value, otherwise use self-managed
  const displayTimestamp = externalLastUpdated ?? internalLastUpdated

  return (
    <div data-testid="dashboard-header" className="flex items-center justify-between mb-6">
      {/* Left side: title + hourglass */}
      <div className="flex items-center gap-3">
        <div>
          <h1 data-testid="dashboard-title" className="text-2xl font-bold text-foreground flex items-center gap-2">
            {icon}
            {title}
          </h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        {/* Reserve fixed width to prevent layout shift */}
        <span
          className={`flex items-center gap-1 text-xs w-[72px] ${isFetching ? 'text-amber-400 animate-pulse' : 'invisible'}`}
          title="Updating..."
        >
          <Hourglass className="w-3 h-3" />
          <span>Updating</span>
        </span>
        {afterTitle}
      </div>

      {/* Right side: controls + timestamp below */}
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-3">
          {rightExtra}
          <label
            htmlFor={`remember-position-${autoRefreshId || 'default'}`}
            className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground"
            title="Remember scroll position when navigating away"
          >
            <input
              type="checkbox"
              id={`remember-position-${autoRefreshId || 'default'}`}
              checked={rememberPosition}
              onChange={(e) => {
                setRememberPositionState(e.target.checked)
                setRememberPosition(location.pathname, e.target.checked)
              }}
              className="rounded border-border w-3.5 h-3.5"
            />
            Pin
          </label>
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
            data-testid="dashboard-refresh-button"
            onClick={onRefresh}
            disabled={isFetching}
            className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {error ? (
          <button
            onClick={onRefresh}
            disabled={isFetching}
            className="text-xs text-red-400 flex items-center gap-1.5 hover:text-red-300 transition-colors disabled:opacity-50 cursor-pointer"
            role="alert"
            aria-live="polite"
            title="Click to retry"
          >
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            <span>{error}</span>
            <RefreshCw className="w-3 h-3" />
          </button>
        ) : displayTimestamp ? (
          <span className="text-xs text-muted-foreground">
            Updated {displayTimestamp.toLocaleTimeString()}
          </span>
        ) : null}
      </div>
    </div>
  )
}
