import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, Hourglass, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  // Self-managed timestamp: updates when isFetching goes true → false
  const [internalLastUpdated, setInternalLastUpdated] = useState<Date>(() => new Date())
  // Spin the refresh icon — starts on fetch, completes at least one full turn (1s)
  const [spinning, setSpinning] = useState(false)
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasFetchingRef = useRef(isFetching)

  useEffect(() => {
    if (wasFetchingRef.current && !isFetching) {
      setInternalLastUpdated(new Date())
      // Keep spinning for one more rotation after fetch ends
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current)
      spinTimeoutRef.current = setTimeout(() => {
        setSpinning(false)
        spinTimeoutRef.current = null
      }, 1000)
    }
    // Start spinning when fetch begins
    if (!wasFetchingRef.current && isFetching) {
      if (spinTimeoutRef.current) {
        clearTimeout(spinTimeoutRef.current)
        spinTimeoutRef.current = null
      }
      setSpinning(true)
    }
    wasFetchingRef.current = isFetching
  }, [isFetching])

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current)
    }
  }, [])

  // Use external override if it has a value, otherwise use self-managed
  const displayTimestamp = externalLastUpdated ?? internalLastUpdated
  // Alias isFetching as isLoading for consistent loading state semantics
  const isLoading = isFetching

  return (
    <div data-testid="dashboard-header" className="flex items-center justify-between gap-4 flex-wrap mb-6">
      {/* Left side: title + hourglass */}
      <div className="flex items-center gap-3 min-w-0">
        <div>
          <h1 data-testid="dashboard-title" className="text-2xl font-bold text-foreground flex items-center gap-2">
            {icon}
            {title}
          </h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        {/* Reserve fixed width to prevent layout shift */}
        <span
          className={`flex items-center gap-1 text-xs w-18 ${isFetching ? 'text-yellow-400 animate-pulse' : 'invisible'}`}
          title={t('common.updating')}
          aria-busy={isLoading}
        >
          <Hourglass className="w-3 h-3" />
          <span>{t('common.updating')}</span>
        </span>
        {afterTitle}
      </div>

      {/* Right side: controls + timestamp below */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <div className="flex items-center gap-3" role="toolbar" aria-label={t('shared.dashboardHeader.toolbarLabel', { defaultValue: 'Dashboard controls' })}>
          {rightExtra}
          {onAutoRefreshChange && (
            <label
              htmlFor={autoRefreshId || 'auto-refresh'}
              className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground"
              title={t('shared.dashboardHeader.autoRefreshTitle')}
            >
              <input
                type="checkbox"
                id={autoRefreshId || 'auto-refresh'}
                checked={autoRefresh ?? false}
                onChange={(e) => onAutoRefreshChange(e.target.checked)}
                className="rounded border-border w-3.5 h-3.5"
              />
              {t('shared.dashboardHeader.auto')}
            </label>
          )}
          <button
            data-testid="dashboard-refresh-button"
            onClick={onRefresh}
            disabled={isFetching}
            className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
            aria-label={t('common.refreshClusterData')}
            title={t('common.refreshClusterData')}
          >
            <RefreshCw
              className={`w-4 h-4 ${(isFetching || spinning) ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
        {error ? (
          <button
            onClick={onRefresh}
            disabled={isFetching}
            className="text-xs text-red-400 flex items-center gap-1.5 hover:text-red-300 transition-colors disabled:opacity-50 cursor-pointer"
            role="alert"
            aria-live="polite"
            title={t('shared.dashboardHeader.clickToRetry')}
          >
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            <span>{error}</span>
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        ) : displayTimestamp ? (
          <span className="text-xs text-muted-foreground">
            {t('shared.dashboardHeader.updated', { time: displayTimestamp.toLocaleTimeString() })}
          </span>
        ) : null}
      </div>
    </div>
  )
}
