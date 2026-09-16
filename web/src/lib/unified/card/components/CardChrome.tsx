/**
 * CardChrome - InlineStats and CardFooter chrome elements for UnifiedCard
 *
 * Extracted from UnifiedCard.tsx to keep the composition root focused on
 * data flow. Pure presentational components with no data-fetching logic.
 */

import type { UnifiedCardConfig } from '../../types'

/**
 * Inline stats displayed at top of card
 *
 * Note: Value resolution is intentionally left as placeholder ("--") until the stats
 * feature design is finalized. Stats config includes valueField/valueResolver for future
 * implementation to compute values from card data.
 */
export function InlineStats({
  stats,
  data: _data }: {
  stats: NonNullable<UnifiedCardConfig['stats']>
  data: unknown[] | unknown | undefined
}) {
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 border-b border-border">
      {stats.map((stat) => (
        <div key={stat.id} className="flex items-center gap-1.5 text-xs">
          <div className={`w-2 h-2 rounded-full ${stat.bgColor ?? 'bg-muted-foreground'}`} />
          <span className="text-muted-foreground">{stat.label}:</span>
          <span className="font-medium text-foreground">--</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Card footer component
 */
export function CardFooter({
  config,
  data }: {
  config: NonNullable<UnifiedCardConfig['footer']>
  data: unknown[] | unknown | undefined
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground border-t border-border">
      {config.showTotal && !!data && (
        <span>{Array.isArray(data) ? data.length : 1} items</span>
      )}
      {config.text && <span>{config.text}</span>}
      {config.pagination && (
        <span className="text-muted-foreground">Pagination placeholder</span>
      )}
    </div>
  )
}
