/**
 * renderCardContent - Dispatches to the appropriate visualization based on
 * content.type for UnifiedCard.
 *
 * Extracted from UnifiedCard.tsx to keep the composition root focused on
 * data flow / state management.
 */

import { ReactNode, Suspense, ComponentType } from 'react'
import type { UnifiedCardConfig, CardContent } from '../../types'
import { ListVisualization } from '../visualizations/ListVisualization'
import { TableVisualization } from '../visualizations/TableVisualization'
import { StatusGridVisualization } from '../visualizations/StatusGridVisualization'
import type { ChartVisualizationProps } from '../visualizations/ChartVisualization'
import { PlaceholderVisualization } from './PlaceholderVisualization'

/**
 * Render the appropriate visualization based on content.type
 */
export function renderCardContent(
  content: CardContent,
  data: unknown[] | unknown,
  config: UnifiedCardConfig,
  LazyChartVisualization: ComponentType<ChartVisualizationProps>,
  onDrillDown?: (item: Record<string, unknown>) => void
): ReactNode {
  switch (content.type) {
    case 'list':
      return (
        <ListVisualization
          content={content}
          data={data as unknown[]}
          drillDown={config.drillDown}
          onDrillDown={onDrillDown}
        />
      )

    case 'table':
      return (
        <TableVisualization
          content={content}
          data={data as unknown[]}
          drillDown={config.drillDown}
          onDrillDown={onDrillDown}
        />
      )

    case 'chart':
      return (
        <Suspense fallback={<div className="animate-pulse bg-secondary/30 rounded" style={{ height: content.height ?? 200 }} />}>
          <LazyChartVisualization
            content={content}
            data={data as unknown[]}
          />
        </Suspense>
      )

    case 'status-grid':
      return (
        <StatusGridVisualization
          content={content}
          data={data}
        />
      )

    case 'custom':
      // Custom components are rendered as placeholders until registered via component registry
      return (
        <PlaceholderVisualization
          type={`custom: ${content.componentName}`}
          itemCount={Array.isArray(data) ? data.length : data ? 1 : 0}
        />
      )

    default:
      return (
        <div className="text-muted-foreground text-sm p-4">
          Unknown content type: {(content as { type: string }).type}
        </div>
      )
  }
}
