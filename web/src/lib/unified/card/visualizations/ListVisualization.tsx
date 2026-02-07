/**
 * ListVisualization - Renders data as a scrollable list
 *
 * Used for card content type 'list'. Displays data items in rows
 * with configurable columns and cell renderers.
 */

import { useMemo, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CardContentList, CardColumnConfig, CardDrillDownConfig, CardAIActionsConfig } from '../../types'
import { renderCell } from '../renderers'
import { CardAIActions } from '../../../cards/CardComponents'

export interface ListVisualizationProps {
  /** Content configuration */
  content: CardContentList
  /** Data to display */
  data: unknown[]
  /** Drill-down configuration */
  drillDown?: CardDrillDownConfig
  /** Drill-down handler */
  onDrillDown?: (item: Record<string, unknown>) => void
}

/**
 * ListVisualization - Renders data as a list
 */
export function ListVisualization({
  content,
  data,
  drillDown,
  onDrillDown,
}: ListVisualizationProps) {
  const { columns, pageSize = 10, itemClick = 'none', showRowNumbers = false, aiActions } = content

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0)

  // Calculate pagination
  const totalPages = Math.ceil(data.length / pageSize)
  const paginatedData = useMemo(() => {
    if (!pageSize || pageSize <= 0) return data
    const start = currentPage * pageSize
    return data.slice(start, start + pageSize)
  }, [data, currentPage, pageSize])

  // Handle item click
  const handleItemClick = useCallback(
    (item: Record<string, unknown>) => {
      if (itemClick === 'none') return
      if (itemClick === 'drill' && onDrillDown) {
        onDrillDown(item)
      }
      // 'expand' and 'select' can be implemented later
    },
    [itemClick, onDrillDown]
  )

  // Get visible columns (filter out hidden)
  const visibleColumns = useMemo(
    () => columns.filter((col) => !col.hidden),
    [columns]
  )

  // Find primary column for styling
  const primaryColumn = useMemo(
    () => columns.find((col) => col.primary),
    [columns]
  )

  const isClickable = itemClick !== 'none' && !!(drillDown || onDrillDown)

  return (
    <div className="flex flex-col h-full">
      {/* List content */}
      <div className="flex-1 overflow-y-auto">
        {paginatedData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No items to display
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {paginatedData.map((item, index) => (
              <ListItem
                key={index}
                item={item as Record<string, unknown>}
                columns={visibleColumns}
                primaryColumn={primaryColumn}
                rowNumber={showRowNumbers ? currentPage * pageSize + index + 1 : undefined}
                isClickable={isClickable}
                onClick={() => handleItemClick(item as Record<string, unknown>)}
                aiActions={aiActions}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800 text-xs text-gray-400">
          <span>
            {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, data.length)} of {data.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-1 rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="p-1 rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Individual list item row
 */
function ListItem({
  item,
  columns,
  primaryColumn,
  rowNumber,
  isClickable,
  onClick,
  aiActions,
}: {
  item: Record<string, unknown>
  columns: CardColumnConfig[]
  primaryColumn?: CardColumnConfig
  rowNumber?: number
  isClickable: boolean
  onClick: () => void
  aiActions?: CardAIActionsConfig
}) {
  // Build AI resource context from item using the mapping config
  const aiResource = useMemo(() => {
    if (!aiActions) return null

    const { resourceMapping, issuesField, contextFields, showRepair } = aiActions
    const { kind, nameField, namespaceField, clusterField, statusField } = resourceMapping

    // Kind can be a static value or a field reference (starts with $)
    const resolvedKind = kind.startsWith('$')
      ? String(item[kind.slice(1)] ?? '')
      : kind

    const resource = {
      kind: resolvedKind,
      name: String(item[nameField] ?? ''),
      namespace: namespaceField ? String(item[namespaceField] ?? '') : undefined,
      cluster: clusterField ? String(item[clusterField] ?? '') : undefined,
      status: statusField ? String(item[statusField] ?? '') : undefined,
    }

    // Extract issues if configured
    let issues: Array<{ name: string; message: string }> = []
    if (issuesField) {
      const rawIssues = item[issuesField]
      if (Array.isArray(rawIssues)) {
        issues = rawIssues.map((issue) => {
          if (typeof issue === 'string') {
            return { name: resource.status || 'Issue', message: issue }
          }
          if (typeof issue === 'object' && issue !== null) {
            return {
              name: String((issue as Record<string, unknown>).name ?? 'Issue'),
              message: String((issue as Record<string, unknown>).message ?? ''),
            }
          }
          return { name: 'Issue', message: String(issue) }
        })
      }
    }

    // Extract additional context fields
    const additionalContext: Record<string, unknown> = {}
    if (contextFields) {
      for (const field of contextFields) {
        additionalContext[field] = item[field]
      }
    }

    return { resource, issues, additionalContext, showRepair: showRepair !== false }
  }, [item, aiActions])

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 group ${
        isClickable
          ? 'cursor-pointer hover:bg-gray-800/50 transition-colors'
          : ''
      }`}
      onClick={isClickable ? onClick : undefined}
    >
      {/* Row number */}
      {rowNumber !== undefined && (
        <span className="text-xs text-gray-600 w-6 text-right shrink-0">
          {rowNumber}
        </span>
      )}

      {/* Columns */}
      {columns.map((column, colIndex) => {
        const value = item[column.field]
        const isPrimary = column === primaryColumn

        return (
          <div
            key={column.field}
            className={`
              ${column.width ? '' : 'flex-1'}
              ${column.align === 'center' ? 'text-center' : ''}
              ${column.align === 'right' ? 'text-right' : ''}
              ${isPrimary ? 'font-medium text-gray-200' : 'text-gray-400'}
              ${colIndex === 0 && !rowNumber ? 'flex-1' : ''}
              truncate
            `}
            style={
              column.width
                ? {
                    width: typeof column.width === 'number' ? `${column.width}px` : column.width,
                    flexShrink: 0,
                  }
                : undefined
            }
          >
            {renderCell(value, item, column)}
          </div>
        )
      })}

      {/* AI Actions (Diagnose/Repair) */}
      {aiResource && (
        <CardAIActions
          resource={aiResource.resource}
          issues={aiResource.issues}
          additionalContext={aiResource.additionalContext}
          showRepair={aiResource.showRepair}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        />
      )}
    </div>
  )
}

export default ListVisualization
