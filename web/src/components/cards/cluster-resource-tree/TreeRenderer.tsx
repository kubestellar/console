import { ChevronRight, ChevronDown } from 'lucide-react'
import { StatusIndicator } from '../../charts/StatusIndicator'
import type { TreeNodeProps } from './types'

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
  const isExpanded = expandedNodes.has(id)
  const hasChildren = !!children

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-secondary/50 transition-colors group`}
        style={{ paddingLeft: `${indent * 16 + 8}px` }}
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
        <div className="border-l border-border/50 ml-3" style={{ marginLeft: `${indent * 16 + 16}px` }}>
          {children}
        </div>
      )}
    </div>
  )
}
