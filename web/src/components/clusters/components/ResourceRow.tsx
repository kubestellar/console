import { useMemo } from 'react'
import type { ResourceKind } from '../NamespaceResources'

interface ResourceRowProps {
  resource: {
    kind: ResourceKind
    name: string
    namespace: string
    status?: string
  }
  getIconForKind: (kind: ResourceKind) => JSX.Element | null
}

export function ResourceRow({ resource, getIconForKind }: ResourceRowProps) {
  const icon = useMemo(() => getIconForKind(resource.kind), [resource.kind, getIconForKind])

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/50 hover:bg-card/70 transition-colors">
      <div className="flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{resource.name}</div>
        <div className="text-xs text-muted-foreground truncate">{resource.namespace}</div>
      </div>
      {resource.status && (
        <div className="flex-shrink-0 text-xs font-medium text-muted-foreground px-2 py-1 rounded bg-secondary">
          {resource.status}
        </div>
      )}
    </div>
  )
}
