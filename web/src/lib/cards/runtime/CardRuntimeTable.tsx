/**
 * Table visualization for CardRuntime
 */

import { type KeyboardEvent } from 'react'
import { CardColumnDefinition, CardDrillDownConfig } from '../types'
import { normalizeAlign } from './alignment'

export interface CardRuntimeTableProps {
  columns: CardColumnDefinition[] | undefined
  items: Record<string, unknown>[]
  drillDown: CardDrillDownConfig | undefined
  onItemClick: (item: Record<string, unknown>) => void
  renderCell: (item: Record<string, unknown>, column: CardColumnDefinition) => React.ReactNode
}

export function CardRuntimeTable({ columns, items, drillDown, onItemClick, renderCell }: CardRuntimeTableProps) {
  return (
    <div className="flex-1 overflow-auto scroll-enhanced">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns?.map(col => (
              <th
                key={col.field}
                className={`px-2 py-1.5 text-xs font-medium text-muted-foreground text-${normalizeAlign(col.align)}`}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={idx}
              className={`border-b border-border/50 ${drillDown ? 'cursor-pointer hover:bg-secondary/50' : ''}`}
              onClick={() => drillDown && onItemClick(item)}
              {...(drillDown ? {
                role: 'button' as const,
                tabIndex: 0,
                onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onItemClick(item)
                  }
                },
              } : {})}
            >
              {columns?.map(col => (
                <td
                  key={col.field}
                  className={`px-2 py-2 text-${normalizeAlign(col.align)}`}
                >
                  {renderCell(item, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
