/**
 * Presentational stat block components used by StatsRuntime.
 */

import type { KeyboardEvent } from 'react'
import { getIcon } from '../icons'
import {
  StatBlockDefinition,
  StatBlockValue,
  COLOR_CLASSES,
  VALUE_COLORS } from './types'

// ============================================================================
// StatBlock Component
// ============================================================================

interface StatBlockProps {
  block: StatBlockDefinition
  value: StatBlockValue
  hasData: boolean
}

export function StatBlock({ block, value, hasData }: StatBlockProps) {
  const IconComponent = getIcon(block.icon)
  const colorClass = COLOR_CLASSES[block.color] || 'text-foreground'
  const valueColorClass = VALUE_COLORS[block.id] || value.color ? COLOR_CLASSES[value.color!] : 'text-foreground'
  const isClickable = value.isClickable !== false && !!value.onClick

  const displayValue = hasData ? value.value : '-'

  const handleActivate = () => {
    if (isClickable) value.onClick?.()
  }

  return (
    <div
      className={`glass p-4 rounded-lg ${isClickable ? 'cursor-pointer hover:bg-secondary/50' : ''} transition-colors`}
      onClick={handleActivate}
      {...(isClickable ? {
        role: 'button' as const,
        tabIndex: 0,
        'aria-label': block.tooltip || value.tooltip || block.label,
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleActivate()
          }
        },
      } : {})}
      title={block.tooltip || value.tooltip}
    >
      <div className="flex items-center gap-2 mb-2">
        <IconComponent className={`w-5 h-5 shrink-0 ${colorClass}`} />
        <span className="text-sm text-muted-foreground truncate">{block.label}</span>
      </div>
      <div className={`text-3xl font-bold ${valueColorClass}`}>{displayValue}</div>
      {value.sublabel && (
        <div className="text-xs text-muted-foreground">{value.sublabel}</div>
      )}
    </div>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

export function StatBlockSkeleton() {
  return (
    <div className="glass p-4 rounded-lg animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-full bg-secondary" />
        <div className="h-4 w-20 bg-secondary rounded" />
      </div>
      <div className="h-9 w-16 bg-secondary rounded mb-1" />
      <div className="h-3 w-24 bg-secondary rounded" />
    </div>
  )
}
