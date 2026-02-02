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

import { useMemo, ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import type {
  UnifiedCardConfig,
  UnifiedCardProps,
  CardContent,
} from '../types'
import { useDataSource } from './hooks/useDataSource'
import { useCardFiltering } from './hooks/useCardFiltering'
import { ListVisualization } from './visualizations/ListVisualization'
import { TableVisualization } from './visualizations/TableVisualization'
import { ChartVisualization } from './visualizations/ChartVisualization'

/**
 * UnifiedCard - Renders any card type from config
 */
export function UnifiedCard({
  config,
  instanceConfig,
  title: _titleOverride,
  className,
}: UnifiedCardProps) {
  // Merge instance config with base config
  const mergedConfig = useMemo(() => {
    if (!instanceConfig) return config
    return {
      ...config,
      // Instance config can override certain fields
      ...instanceConfig,
    } as UnifiedCardConfig
  }, [config, instanceConfig])

  // Fetch data using the configured data source
  const { data, isLoading, error, refetch } = useDataSource(mergedConfig.dataSource)

  // Apply filtering if configured
  const { filteredData, filterControls } = useCardFiltering(
    data,
    mergedConfig.filters
  )

  // Determine what to render
  const content = useMemo(() => {
    // Error state
    if (error) {
      return (
        <ErrorState
          message={error.message}
          onRetry={refetch}
        />
      )
    }

    // Loading state
    if (isLoading) {
      return <LoadingState config={mergedConfig.loadingState} />
    }

    // Empty state
    if (!filteredData || filteredData.length === 0) {
      return <EmptyState config={mergedConfig.emptyState} />
    }

    // Render the appropriate visualization based on content type
    return renderContent(mergedConfig.content, filteredData, mergedConfig)
  }, [error, isLoading, filteredData, mergedConfig, refetch])

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

/**
 * Render the appropriate visualization based on content.type
 */
function renderContent(
  content: CardContent,
  data: unknown[],
  config: UnifiedCardConfig
): ReactNode {
  switch (content.type) {
    case 'list':
      return (
        <ListVisualization
          content={content}
          data={data}
          drillDown={config.drillDown}
        />
      )

    case 'table':
      return (
        <TableVisualization
          content={content}
          data={data}
          drillDown={config.drillDown}
        />
      )

    case 'chart':
      return (
        <ChartVisualization
          content={content}
          data={data}
        />
      )

    case 'status-grid':
      // TODO: Implement in PR 4
      return (
        <PlaceholderVisualization
          type="status-grid"
          itemCount={content.items.length}
        />
      )

    case 'custom':
      // TODO: Load from component registry
      return (
        <PlaceholderVisualization
          type={`custom: ${content.componentName}`}
          itemCount={data.length}
        />
      )

    default:
      return (
        <div className="text-gray-400 text-sm p-4">
          Unknown content type: {(content as { type: string }).type}
        </div>
      )
  }
}

/**
 * Placeholder visualization while actual implementations are built
 */
function PlaceholderVisualization({
  type,
  itemCount,
  columns,
}: {
  type: string
  itemCount: number
  columns?: number
}) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-gray-500 border border-dashed border-gray-700 rounded-lg m-2">
      <Info className="w-8 h-8 mb-2 text-blue-400" />
      <div className="text-sm font-medium">Visualization: {type}</div>
      <div className="text-xs mt-1">
        {itemCount} items{columns ? `, ${columns} columns` : ''}
      </div>
      <div className="text-xs mt-2 text-gray-600">
        (Implementation pending - PR 2/4)
      </div>
    </div>
  )
}

/**
 * Loading state component
 */
function LoadingState({
  config,
}: {
  config?: UnifiedCardConfig['loadingState']
}) {
  const rows = config?.rows ?? 3
  const showSearch = config?.showSearch ?? true

  return (
    <div className="p-2 space-y-2 animate-pulse">
      {showSearch && (
        <div className="h-8 bg-gray-800 rounded w-full" />
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-4 bg-gray-800 rounded w-16" />
          <div className="h-4 bg-gray-800 rounded flex-1" />
          <div className="h-4 bg-gray-800 rounded w-20" />
        </div>
      ))}
    </div>
  )
}

/**
 * Empty state component
 */
function EmptyState({
  config,
}: {
  config?: UnifiedCardConfig['emptyState']
}) {
  // TODO: Use dynamic icon lookup based on config?.icon (using Info for now)
  const title = config?.title ?? 'No data'
  const message = config?.message
  const variant = config?.variant ?? 'neutral'

  const variantColors = {
    success: 'text-green-400',
    info: 'text-blue-400',
    warning: 'text-yellow-400',
    neutral: 'text-gray-400',
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <div className={`mb-2 ${variantColors[variant]}`}>
        <Info className="w-8 h-8" />
      </div>
      <div className="text-sm font-medium text-gray-300">{title}</div>
      {message && (
        <div className="text-xs text-gray-500 mt-1">{message}</div>
      )}
    </div>
  )
}

/**
 * Error state component
 */
function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
      <div className="text-sm font-medium text-gray-300">Error loading data</div>
      <div className="text-xs text-gray-500 mt-1">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}

/**
 * Inline stats displayed at top of card
 */
function InlineStats({
  stats,
  data: _data,
}: {
  stats: NonNullable<UnifiedCardConfig['stats']>
  data: unknown[] | undefined
}) {
  // TODO: Implement value resolution from stats config
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 border-b border-gray-800">
      {stats.map((stat) => (
        <div key={stat.id} className="flex items-center gap-1.5 text-xs">
          <div className={`w-2 h-2 rounded-full ${stat.bgColor ?? 'bg-gray-600'}`} />
          <span className="text-gray-400">{stat.label}:</span>
          <span className="font-medium text-gray-200">--</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Card footer component
 */
function CardFooter({
  config,
  data,
}: {
  config: NonNullable<UnifiedCardConfig['footer']>
  data: unknown[] | undefined
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 text-xs text-gray-500 border-t border-gray-800">
      {config.showTotal && data && (
        <span>{data.length} items</span>
      )}
      {config.text && <span>{config.text}</span>}
      {config.pagination && (
        <span className="text-gray-600">Pagination placeholder</span>
      )}
    </div>
  )
}

export default UnifiedCard
