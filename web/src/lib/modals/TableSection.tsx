/**
 * TableSection - Display tabular data with customizable columns
 *
 * @example
 * ```tsx
 * <TableSection
 *   data={containers}
 *   columns={[
 *     { key: 'name', header: 'Name' },
 *     { key: 'image', header: 'Image' },
 *     { key: 'status', header: 'Status', render: 'status' },
 *   ]}
 * />
 * ```
 */

import { ReactNode } from 'react'
import { getStatusColors } from './types'

export interface TableColumn<T = Record<string, unknown>> {
  key: string
  header: string
  width?: number | string
  render?: 'text' | 'status' | 'timestamp' | 'badge' | 'code' | ((value: unknown, row: T) => ReactNode)
  align?: 'left' | 'center' | 'right'
}

export interface TableSectionProps<T = Record<string, unknown>> {
  data: T[]
  columns: TableColumn<T>[]
  onRowClick?: (row: T) => void
  emptyMessage?: string
  className?: string
  maxHeight?: string
}

export function TableSection<T extends Record<string, unknown>>({
  data,
  columns,
  onRowClick,
  emptyMessage = 'No data',
  className = '',
  maxHeight = '300px',
}: TableSectionProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  const renderCell = (column: TableColumn<T>, row: T) => {
    const value = row[column.key]

    if (typeof column.render === 'function') {
      return column.render(value, row)
    }

    switch (column.render) {
      case 'status': {
        const status = String(value)
        const colors = getStatusColors(status)
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
            {status}
          </span>
        )
      }

      case 'timestamp': {
        const date = value instanceof Date ? value : new Date(String(value))
        return date.toLocaleString()
      }

      case 'badge':
        return (
          <span className="px-2 py-0.5 rounded bg-secondary text-xs">
            {String(value)}
          </span>
        )

      case 'code':
        return (
          <code className="px-1.5 py-0.5 bg-secondary rounded text-xs font-mono">
            {String(value)}
          </code>
        )

      default:
        return value != null ? String(value) : '-'
    }
  }

  return (
    <div className={`overflow-auto ${className}`} style={{ maxHeight }}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card border-b border-border">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-3 py-2 text-left text-xs font-medium text-muted-foreground ${
                  column.align === 'center' ? 'text-center' :
                  column.align === 'right' ? 'text-right' : ''
                }`}
                style={{ width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={index}
              className={`border-b border-border/50 ${
                onRowClick ? 'cursor-pointer hover:bg-secondary/50' : ''
              }`}
              onClick={() => onRowClick?.(row)}
              {...(onRowClick ? {
                tabIndex: 0,
                onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row) } },
              } : {})}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-3 py-2 ${
                    column.align === 'center' ? 'text-center' :
                    column.align === 'right' ? 'text-right' : ''
                  }`}
                >
                  {renderCell(column, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
