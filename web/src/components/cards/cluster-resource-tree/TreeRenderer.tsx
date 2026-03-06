import { ChevronRight, ChevronDown } from 'lucide-react'
import { StatusIndicator } from '../../charts/StatusIndicator'
import type { TreeNodeProps } from './types'
import { useTranslation } from 'react-i18next'

/** Pixels of horizontal indent per tree nesting level */
const INDENT_PER_LEVEL_PX = 16
/** Base left padding for tree nodes */
const BASE_PADDING_LEFT_PX = 8

interface TreeNodeInternalProps extends TreeNodeProps {
  expandedNodes: Set<string>
  toggleNode: (nodeId: string) => void
}

export function TreeNode({
  id,
  label,
  icon: Icon,
  iconColor,
  count,
  children,
  onClick,
  onToggle,
  badge,
  badgeColor = 'bg-secondary text-muted-foreground',
  statusIndicator,
  indent = 0,
  expandedNodes,
  toggleNode,
}: TreeNodeInternalProps) {
  const { t: _t } = useTranslation()
  const isExpanded = expandedNodes.has(id)
  const hasChildren = !!children

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-secondary/50 transition-colors group`}
        style={{ paddingLeft: `${indent * INDENT_PER_LEVEL_PX + BASE_PADDING_LEFT_PX}px` }}
      >
        {/* Chevron + Icon - handles expand/collapse */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const willExpand = !isExpanded
              toggleNode(id)
              onToggle?.(willExpand)
            }}
            className="flex items-center gap-1 p-1 -m-0.5 rounded hover:bg-secondary flex-shrink-0"
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
          </button>
        ) : (
          <div className="flex items-center gap-1 p-1 -m-0.5">
            <span className="w-3.5" />
            <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
          </div>
        )}
        {/* Label - clickable for navigation/drilldown only */}
        <span
          onClick={(e) => {
            e.stopPropagation()
            onClick?.()
          }}
          {...(onClick ? {
            role: 'button' as const,
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } },
          } : {})}
          className={`text-sm text-foreground truncate ${onClick ? 'cursor-pointer hover:text-purple-400' : ''}`}
        >
          {label}
        </span>
        {statusIndicator && <StatusIndicator status={statusIndicator} size="sm" />}
        {count !== undefined && (
          <span className="text-xs text-muted-foreground ml-1">({count})</span>
        )}
        {badge !== undefined && (
          <span className={`px-1.5 py-0.5 text-[10px] rounded-full ml-auto ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div className="border-l border-border/50 ml-3" style={{ marginLeft: `${indent * INDENT_PER_LEVEL_PX + INDENT_PER_LEVEL_PX}px` }}>
          {children}
        </div>
      )}
    </div>
  )
}
