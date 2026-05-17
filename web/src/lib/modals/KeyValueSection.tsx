/**
 * KeyValueSection - Display key-value pairs with various render modes
 *
 * @example
 * ```tsx
 * <KeyValueSection items={[
 *   { label: 'Name', value: pod.name },
 *   { label: 'Namespace', value: pod.namespace },
 *   { label: 'Status', value: pod.status, render: 'status' },
 * ]} />
 * ```
 */

import { ReactNode, useState, useEffect, useRef } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { getStatusColors, NavigationTarget } from './types'
import { UI_FEEDBACK_TIMEOUT_MS } from '../constants/network'
import { Button } from '../../components/ui/Button'
import { copyToClipboard } from '../clipboard'

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
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const handleCopy = async () => {
    const textValue = typeof item.value === 'string'
      ? item.value
      : String(item.value)

    await copyToClipboard(textValue)
    setCopied(true)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
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
        // #6711 — Guard against invalid dates so we don't render the string
        // "Invalid Date". When `value` is null/undefined/unparseable, the
        // Date constructor produces a NaN-timestamp Date whose toISOString()
        // throws. Check validity first and render an em-dash placeholder.
        const date = value instanceof Date ? value : new Date(String(value ?? ''))
        if (isNaN(date.getTime())) {
          return <span className="text-muted-foreground">—</span>
        }
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
          <Button
            variant="ghost"
            onClick={handleCopy}
            className="p-1 rounded-md"
            title="Copy to clipboard"
            icon={copied ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          />
        )}
      </dd>
    </div>
  )
}
