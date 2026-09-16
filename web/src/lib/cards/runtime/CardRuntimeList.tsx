/**
 * List/status visualization for CardRuntime
 */

import { CardColumnDefinition, CardDrillDownConfig } from '../types'
import { CardListItem } from '../CardComponents'

export interface CardRuntimeListProps {
  columns: CardColumnDefinition[] | undefined
  items: Record<string, unknown>[]
  drillDown: CardDrillDownConfig | undefined
  onItemClick: (item: Record<string, unknown>) => void
  renderCell: (item: Record<string, unknown>, column: CardColumnDefinition) => React.ReactNode
}

export function CardRuntimeList({ columns, items, drillDown, onItemClick, renderCell }: CardRuntimeListProps) {
  return (
    <div className="flex-1 space-y-2 overflow-y-auto scroll-enhanced min-h-card-content">
      {items.map((item, idx) => (
        <CardListItem
          key={idx}
          onClick={drillDown ? () => onItemClick(item) : undefined}
          dataTour={idx === 0 ? 'drilldown' : undefined}
        >
          {columns?.slice(0, 3).map(col => (
            <div key={col.field}>{renderCell(item, col)}</div>
          ))}
        </CardListItem>
      ))}
    </div>
  )
}
