import {
  ChevronRight,
  ChevronDown,
  Maximize2,
  Trash2,
} from 'lucide-react'
import type { Mission } from '../../../hooks/useMissions'
import { cn } from '../../../lib/cn'
import { STATUS_CONFIG, TYPE_ICONS } from './types'

export function MissionListItem({ mission, isActive, onClick, onDismiss, onExpand, isCollapsed, onToggleCollapse }: {
  mission: Mission
  isActive: boolean
  onClick: () => void
  onDismiss: () => void
  onExpand: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}) {
  const config = STATUS_CONFIG[mission.status]
  const StatusIcon = config.icon
  const TypeIcon = TYPE_ICONS[mission.type]

  return (
    <div
      className={cn(
        'w-full text-left rounded-lg transition-colors',
        isActive
          ? 'bg-primary/20 border border-primary/50'
          : 'hover:bg-secondary/50 border border-transparent'
      )}
    >
      {/* Header row with controls */}
      <div className="flex items-center gap-2 p-3 pb-0">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
          className="p-0.5 hover:bg-secondary/50 rounded transition-colors"
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
        <div className={cn('flex-shrink-0', config.color)}>
          <StatusIcon className={cn('w-4 h-4', mission.status === 'running' && 'animate-spin')} />
        </div>
        <button
          onClick={onClick}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <TypeIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{mission.title}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onExpand() }}
          className="p-0.5 hover:bg-secondary/50 rounded transition-colors flex-shrink-0"
          title="Open full screen"
        >
          <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          className="p-0.5 hover:bg-red-500/20 rounded transition-colors flex-shrink-0"
          title="Delete mission"
        >
          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
        </button>
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <button
          onClick={onClick}
          className="w-full text-left px-3 pb-3 pt-1 pl-10"
        >
          <p className="text-xs text-muted-foreground truncate">{mission.description}</p>
          <div className="flex items-center gap-2 mt-1">
            {mission.cluster && (
              <span className="text-xs text-purple-400">@{mission.cluster}</span>
            )}
            <span className="text-[10px] text-muted-foreground/70">
              {mission.createdAt.toLocaleDateString()} {mission.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </button>
      )}
    </div>
  )
}
