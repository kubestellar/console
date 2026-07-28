import { ChevronRight } from 'lucide-react'
import type { ResourceKind, ResourceItem } from './resourceHelpers'
import { getKindIcon, getStatusBgColor } from './resourceHelpers'

interface ResourceListViewProps {
  allResources: ResourceItem[]
  namespace: string
  onResourceClick: (kind: ResourceKind, name: string, ns: string, data?: Record<string, unknown>) => void
}

export function ResourceListView({ allResources, namespace, onResourceClick }: ResourceListViewProps) {
  return (
    <div className="space-y-1 max-h-[300px] overflow-y-auto">
      {allResources.slice(0, 50).map((resource, idx) => (
        <div
          key={`${resource.kind}-${resource.name}-${idx}`}
          className="flex items-center justify-between p-2 min-h-11 rounded bg-card/30 text-sm group hover:bg-card/50 transition-colors cursor-pointer"
          onClick={() => onResourceClick(resource.kind, resource.name, resource.namespace || namespace, resource.data)}
        >
          <div className="flex items-center gap-2 min-w-0">
            {getKindIcon(resource.kind)}
            <span className="text-foreground truncate">{resource.name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs shrink-0">
            {resource.detail && <span className="text-muted-foreground">{resource.detail}</span>}
            {resource.status && (
              <span className={`px-1.5 py-0.5 rounded ${getStatusBgColor(resource.statusColor)}`}>
                {resource.status}
              </span>
            )}
            <ChevronRight className="w-3 h-3 text-primary" />
          </div>
        </div>
      ))}
      {allResources.length > 50 && (
        <div className="text-xs text-muted-foreground text-center py-2">
          +{allResources.length - 50} more resources
        </div>
      )}
    </div>
  )
}
