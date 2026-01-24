/**
 * ModalSections - Reusable section components for modals
 *
 * These components can be composed declaratively or rendered from YAML definitions.
 *
 * @example
 * ```tsx
 * <KeyValueSection items={[
 *   { label: 'Name', value: pod.name },
 *   { label: 'Namespace', value: pod.namespace },
 *   { label: 'Status', value: pod.status, render: 'status' },
 * ]} />
 *
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

import { ReactNode, useState } from 'react'
import { Copy, Check, ChevronDown, ChevronRight, ExternalLink, AlertCircle } from 'lucide-react'
import { getStatusColors, NavigationTarget } from './types'

// ============================================================================
// Key-Value Section
// ============================================================================

export interface KeyValueItem {
  label: string
  value: ReactNode
  render?: 'text' | 'status' | 'timestamp' | 'json' | 'link' | 'badge' | 'code' | 'copyable'
  copyable?: boolean
  linkTo?: NavigationTarget
  tooltip?: string
}

export interface KeyValueSectionProps {
  items: KeyValueItem[]
  columns?: 1 | 2 | 3
  className?: string
  onNavigate?: (target: NavigationTarget) => void
}

export function KeyValueSection({
  items,
  columns = 2,
  className = '',
  onNavigate,
}: KeyValueSectionProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
  }

  return (
    <div className={`grid ${gridCols[columns]} gap-4 ${className}`}>
      {items.map((item, index) => (
        <KeyValueItem
          key={index}
          item={item}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

function KeyValueItem({
  item,
  onNavigate,
}: {
  item: KeyValueItem
  onNavigate?: (target: NavigationTarget) => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const textValue = typeof item.value === 'string'
      ? item.value
      : String(item.value)

    await navigator.clipboard.writeText(textValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const renderValue = () => {
    const value = item.value

    switch (item.render) {
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
        return (
          <span title={date.toISOString()}>
            {date.toLocaleString()}
          </span>
        )
      }

      case 'json':
        return (
          <pre className="text-xs bg-secondary p-2 rounded overflow-x-auto max-h-32">
            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          </pre>
        )

      case 'code':
        return (
          <code className="px-1.5 py-0.5 bg-secondary rounded text-xs font-mono">
            {String(value)}
          </code>
        )

      case 'link':
        if (item.linkTo && onNavigate) {
          return (
            <button
              onClick={() => onNavigate(item.linkTo!)}
              className="text-purple-400 hover:text-purple-300 hover:underline flex items-center gap-1"
            >
              {String(value)}
              <ExternalLink className="w-3 h-3" />
            </button>
          )
        }
        return String(value)

      case 'badge':
        return (
          <span className="px-2 py-0.5 rounded bg-secondary text-xs">
            {String(value)}
          </span>
        )

      default:
        return value ?? <span className="text-muted-foreground">-</span>
    }
  }

  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{item.label}</dt>
      <dd className="text-sm text-foreground flex items-center gap-2">
        {renderValue()}
        {(item.copyable || item.render === 'copyable') && (
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        )}
      </dd>
    </div>
  )
}

// ============================================================================
// Table Section
// ============================================================================

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

// ============================================================================
// Collapsible Section
// ============================================================================

export interface CollapsibleSectionProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  badge?: string | number
  className?: string
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  badge,
  className = '',
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={className}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 text-sm font-medium text-foreground hover:text-purple-400 transition-colors"
      >
        <span className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          {title}
        </span>
        {badge !== undefined && (
          <span className="px-2 py-0.5 rounded bg-secondary text-xs text-muted-foreground">
            {badge}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="pl-6 pb-2">
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Alert Section
// ============================================================================

export interface AlertSectionProps {
  type: 'info' | 'warning' | 'error' | 'success'
  title?: string
  message: string
  className?: string
}

export function AlertSection({
  type,
  title,
  message,
  className = '',
}: AlertSectionProps) {
  const styles = {
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
    error: 'bg-red-500/10 border-red-500/20 text-red-400',
    success: 'bg-green-500/10 border-green-500/20 text-green-400',
  }

  return (
    <div className={`p-3 rounded-lg border ${styles[type]} ${className}`}>
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          {title && (
            <p className="font-medium text-sm">{title}</p>
          )}
          <p className="text-sm opacity-90">{message}</p>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Empty State Section
// ============================================================================

export interface EmptySectionProps {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  message?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptySection({
  icon: Icon,
  title,
  message,
  action,
  className = '',
}: EmptySectionProps) {
  return (
    <div className={`text-center py-8 ${className}`}>
      {Icon && (
        <Icon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      )}
      <h3 className="text-foreground font-medium mb-1">{title}</h3>
      {message && (
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg text-sm font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Loading Section
// ============================================================================

export interface LoadingSectionProps {
  message?: string
  className?: string
}

export function LoadingSection({
  message = 'Loading...',
  className = '',
}: LoadingSectionProps) {
  return (
    <div className={`flex items-center justify-center py-8 ${className}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  )
}

// ============================================================================
// Badges Section
// ============================================================================

export interface Badge {
  label: string
  value: string
  color?: string
  onClick?: () => void
}

export interface BadgesSectionProps {
  badges: Badge[]
  className?: string
}

export function BadgesSection({ badges, className = '' }: BadgesSectionProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {badges.map((badge, index) => (
        <span
          key={index}
          onClick={badge.onClick}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
            badge.color || 'bg-secondary text-muted-foreground'
          } ${badge.onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
        >
          <span className="text-muted-foreground">{badge.label}:</span>
          <span>{badge.value}</span>
        </span>
      ))}
    </div>
  )
}

// ============================================================================
// Quick Actions Section
// ============================================================================

export interface QuickAction {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  variant?: 'default' | 'primary' | 'danger'
  disabled?: boolean
}

export interface QuickActionsSectionProps {
  actions: QuickAction[]
  className?: string
}

export function QuickActionsSection({
  actions,
  className = '',
}: QuickActionsSectionProps) {
  const variantStyles = {
    default: 'bg-secondary hover:bg-secondary/80 text-foreground',
    primary: 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400',
    danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.id}
            onClick={action.onClick}
            disabled={action.disabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              variantStyles[action.variant || 'default']
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Icon className="w-4 h-4" />
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
