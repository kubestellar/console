import { ChevronRight } from 'lucide-react'
import { getKindIcon, getStatusBgColor, type NamespaceResourceItem, type ResourceKind } from './resourceHelpers'

export interface ResourceListViewProps {
  resources: NamespaceResourceItem[]
  namespace: string
  onResourceClick: (kind: ResourceKind, name: string, namespace: string, data?: Record<string, unknown>) => void
}

const MAX_LIST_ITEMS = 50

/**
 * Flat "list view" of namespace resources (icon + name + status per row).
 * Extracted from NamespaceResources.tsx to keep that file under the
 * line/hook budget (#21617).
 */
export function ResourceListView({ resources, namespace, onResourceClick }: ResourceListViewProps) {
  return (
    <div className="space-y-1 max-h-[300px] overflow-y-auto">
      {resources.slice(0, MAX_LIST_ITEMS).map((resource, idx) => (
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
      {resources.length > MAX_LIST_ITEMS && <div className="text-xs text-muted-foreground text-center py-2">+{resources.length - MAX_LIST_ITEMS} more resources</div>}
    </div>
  )
}
