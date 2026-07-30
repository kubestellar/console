import { memo } from 'react'
import { Activity, AlertTriangle, Minus, Plus, X } from 'lucide-react'
import type { ResourceChange } from './NamespaceMonitor.types'
import { MAX_VISIBLE_CHANGES, ResourceColors, ResourceIcons } from './NamespaceMonitor.utils'

// useCardLoadingState is handled by the parent NamespaceMonitor card.

interface NamespaceMonitorChangesPanelProps {
  showChangesPanel: boolean
  recentChanges: ResourceChange[]
  onClose: () => void
  onSelectChange: (change: ResourceChange) => void
}

function NamespaceMonitorChangesPanelComponent({
  showChangesPanel,
  recentChanges,
  onClose,
  onSelectChange,
}: NamespaceMonitorChangesPanelProps) {
  return (
    <div
      className={`absolute right-0 top-12 w-80 bg-card border border-border rounded-lg shadow-xl z-40 transition-all ${
        showChangesPanel ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-y-2 p-3 border-b border-border">
        <span className="text-sm font-medium text-foreground">Recent Changes</span>
        <button
          onClick={onClose}
          aria-label="Close recent changes panel"
          className="p-2 hover:bg-secondary rounded min-h-11 min-w-11 flex items-center justify-center"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {(recentChanges || []).length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No recent changes detected</div>
        ) : (
          (recentChanges || []).slice(0, MAX_VISIBLE_CHANGES).map((change, index) => (
            <div
              key={`${change.cluster}:${change.namespace}:${change.name}:${index}`}
              className={`flex items-start gap-2 p-2 border-b border-border/50 hover:bg-secondary/50 cursor-pointer ${
                change.type === 'added'
                  ? 'bg-green-500/5'
                  : change.type === 'deleted'
                    ? 'bg-red-500/5'
                    : change.type === 'error'
                      ? 'bg-red-500/10'
                      : 'bg-yellow-500/5'
              }`}
              onClick={() => onSelectChange(change)}
            >
              <div
                className={`mt-0.5 ${
                  change.type === 'added'
                    ? 'text-green-400'
                    : change.type === 'deleted'
                      ? 'text-red-400'
                      : change.type === 'error'
                        ? 'text-red-500'
                        : 'text-yellow-400'
                }`}
              >
                {change.type === 'added' ? (
                  <Plus className="w-3.5 h-3.5" />
                ) : change.type === 'deleted' ? (
                  <Minus className="w-3.5 h-3.5" />
                ) : change.type === 'error' ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <Activity className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {(() => {
                    const Icon = ResourceIcons[change.resourceType]
                    return <Icon className={`w-3 h-3 ${ResourceColors[change.resourceType]}`} />
                  })()}
                  <span className="text-xs font-medium text-foreground truncate">{change.name}</span>
                </div>
                <div className="text-2xs text-muted-foreground">
                  {change.namespace} • {new Date(change.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export const NamespaceMonitorChangesPanel = memo(NamespaceMonitorChangesPanelComponent)
