/**
 * UnifiedCard - Single component that renders any card type from configuration
 *
 * This component accepts a UnifiedCardConfig and renders the appropriate
 * visualization based on the content.type field. All variations come from
 * configuration, not code branches.
 *
 * Usage:
 *   <UnifiedCard config={podIssuesConfig} />
 *   <UnifiedCard config={clusterHealthConfig} title="Custom Title" />
 */

import { useMemo } from 'react'
import { safeLazy } from '../../safeLazy'
import type {
  UnifiedCardConfig,
  UnifiedCardProps } from '../types'
import { useDataSource } from './hooks/useDataSource'
import { useCardFiltering } from './hooks/useCardFiltering'
// Lazy-load ChartVisualization to defer the echarts vendor chunk from the
// critical loading path — it is only needed for cards with chartType content.
const LazyChartVisualization = safeLazy(() => import('./visualizations/ChartVisualization'), 'ChartVisualization')
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useReportCardDataState } from '../../../components/cards/CardDataContext'
import { useIsModeSwitching } from '../demo'
import { LoadingState, EmptyState, ErrorState } from './components/CardStateViews'
import { InlineStats, CardFooter } from './components/CardChrome'
import { renderCardContent } from './components/renderCardContent'

/**
 * UnifiedCard - Renders any card type from config
 */
export function UnifiedCard({
  config,
  instanceConfig,
  title: _titleOverride,
  className,
  overrideData }: UnifiedCardProps) {
  // Check if mode is switching (show skeleton during transition)
  const isModeSwitching = useIsModeSwitching()

  // Merge instance config with base config.
  // MUST be memoized: the merged object is passed to useDataSource,
  // useCardFiltering, and InlineStats — if those (or any downstream
  // hook) read `mergedConfig.dataSource`/`.filters`/`.stats` in a
  // useEffect dep, a fresh object every render becomes a setState loop
  // that trips React error #185. Seen today in GA4 on pv_status /
  // /storage. Memoizing against `config` and `instanceConfig` identity
  // is safe: both come from static modules or stable parent state.
  const mergedConfig = useMemo<UnifiedCardConfig>(() => {
    if (!instanceConfig) return config
    return { ...config, ...instanceConfig } as UnifiedCardConfig
  }, [config, instanceConfig])

  // Fetch data using the configured data source (skipped if overrideData provided)
  const { data: fetchedData, isLoading: isDataLoading, error, refetch, isDemoData: hookIsDemoData } = useDataSource(
    mergedConfig.dataSource,
    { skip: !!overrideData }
  )

  // Use override data if provided, otherwise use fetched data
  const data = overrideData ?? fetchedData

  // Show skeleton when loading OR when mode is switching
  const isLoading = isDataLoading || isModeSwitching

  // Determine if we have any data
  const hasAnyData = Array.isArray(data) ? data.length > 0 : !!data

  // Prefer hook-reported demo state over static config metadata:
  // - Static `config.isDemoData: true` is a false-positive source because
  //   it stays `true` even when the hook is serving real live data.
  // - When the hook explicitly reports demo state (`true` or `false`), use
  //   it directly. When the hook does not report demo state
  //   (`hookIsDemoData === undefined`), fall back to the config metadata.
  // See Issues 9356 and 9357 for the regression this fixes.
  const effectiveIsDemoData = hookIsDemoData !== undefined ? hookIsDemoData : mergedConfig.isDemoData

  // Report loading state to CardWrapper for refresh icon animation and skeleton coordination
  // This enables the refresh icon to spin while data is loading or mode is switching
  useReportCardDataState({
    isFailed: !!error,
    consecutiveFailures: error ? 1 : 0,
    errorMessage: error?.message,
    isLoading: isLoading && !hasAnyData,      // Initial load or mode switch - show skeleton
    isRefreshing: isLoading && hasAnyData,     // Refresh - spin refresh icon
    hasData: !isLoading || hasAnyData,         // True once loading completes or has cached data
    isDemoData: effectiveIsDemoData,           // Hook-reported when available, else config
  })

  // Apply filtering if configured
  const { filteredData, filterControls } = useCardFiltering(
    data,
    mergedConfig.filters
  )

  // Get drill-down actions
  const drillDownActions = useDrillDownActions()

  // Create drill-down handler based on config
  const handleDrillDown = (item: Record<string, unknown>) => {
      const drillDown = mergedConfig.drillDown
      if (!drillDown) return

      // Get the action function from useDrillDownActions
      const actionFn = drillDownActions[drillDown.action as keyof typeof drillDownActions]
      if (typeof actionFn !== 'function') {
        console.warn(`Drill-down action "${drillDown.action}" not found`)
        return
      }

      // Extract params from item using the configured param names
      const params = drillDown.params.map((param) => item[param])

      // Add context data if configured
      const contextData: Record<string, unknown> = {}
      if (drillDown.context) {
        for (const [key, fieldPath] of Object.entries(drillDown.context)) {
          contextData[key] = item[fieldPath]
        }
      }

      // Call the action with params + context
      // Action signatures vary, so we spread params and pass context as last arg
      ;(actionFn as (...args: unknown[]) => void)(...params, contextData)
    }

  // Determine what to render
  const content = (() => {
    // Error state
    if (error) {
      return (
        <ErrorState
          message={error.message}
          onRetry={refetch}
        />
      )
    }

    // Loading state (show skeleton with refresh animation)
    if (isLoading) {
      return <LoadingState config={mergedConfig.loadingState} />
    }

    // Empty state
    if (!filteredData || (Array.isArray(filteredData) && filteredData.length === 0)) {
      return <EmptyState config={mergedConfig.emptyState} />
    }

    // Render the appropriate visualization based on content type
    return renderCardContent(mergedConfig.content, filteredData, mergedConfig, LazyChartVisualization, handleDrillDown)
  })()

  return (
    <div className={className}>
      {/* Filter controls (if any) */}
      {filterControls}

      {/* Inline stats (if configured) */}
      {mergedConfig.stats && mergedConfig.stats.length > 0 && (
        <InlineStats stats={mergedConfig.stats} data={filteredData} />
      )}

      {/* Main content */}
      {content}

      {/* Footer (if configured) */}
      {mergedConfig.footer && (
        <CardFooter config={mergedConfig.footer} data={filteredData} />
      )}
    </div>
  )
}

export default UnifiedCard
