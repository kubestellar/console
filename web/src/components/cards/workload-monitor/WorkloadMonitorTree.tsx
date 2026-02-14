import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { DEP_CATEGORIES, getIconForKind } from '../../../lib/resourceCategories'
import type { MonitoredResource, ResourceCategory } from '../../../types/workloadMonitor'
import { useTranslation } from 'react-i18next'

interface TreeProps {
  resources: MonitoredResource[]
  onResourceClick?: (resource: MonitoredResource) => void
}

const STATUS_COLORS: Record<string, string> = {
  healthy: 'text-green-400',
  degraded: 'text-yellow-400',
  unhealthy: 'text-red-400',
  unknown: 'text-gray-400',
  missing: 'text-red-400',
}

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-green-400',
  degraded: 'bg-yellow-400',
  unhealthy: 'bg-red-400',
  unknown: 'bg-gray-400',
  missing: 'bg-red-400',
}

function groupByCategory(resources: MonitoredResource[]) {
  const groups: { label: string; category: ResourceCategory; icon: typeof ChevronDown; resources: MonitoredResource[] }[] = []

  for (const cat of DEP_CATEGORIES) {
    const matching = resources.filter(r => r.category === cat.category)
    if (matching.length > 0) {
      groups.push({ label: cat.label, category: cat.category, icon: cat.icon, resources: matching })
    }
  }

  // Catch-all for 'other'
  const other = resources.filter(r => r.category === 'other')
  if (other.length > 0) {
    groups.push({ label: 'Other', category: 'other', icon: ChevronDown, resources: other })
  }

  return groups
}

export function WorkloadMonitorTree({ resources, onResourceClick }: TreeProps) {
  const { t: _t } = useTranslation()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(DEP_CATEGORIES.map(c => c.label)))
  const groups = groupByCategory(resources)

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  if (resources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No resources found.
      </p>
    )
  }

  return (
    <div className="space-y-0.5">
      {groups.map(group => {
        const GroupIcon = group.icon
        const isExpanded = expandedGroups.has(group.label)
        const healthyCount = group.resources.filter(r => r.status === 'healthy').length
        const totalCount = group.resources.length
        const allHealthy = healthyCount === totalCount

        return (
          <div key={group.label} className="border-b border-border/30 last:border-0">
            <button
              onClick={() => toggleGroup(group.label)}
              className="w-full flex items-center gap-2 py-1.5 px-1 text-left hover:bg-card/30 rounded transition-colors"
            >
              {isExpanded
                ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
              <GroupIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="text-sm text-foreground flex-1">{group.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${allHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                {healthyCount}/{totalCount}
              </span>
            </button>

            {isExpanded && (
              <div className="ml-8 mb-1.5 space-y-0.5">
                {group.resources.map(resource => {
                  const ResourceIcon = getIconForKind(resource.kind)
                  return (
                    <div
                      key={resource.id}
                      className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-card/30 cursor-pointer transition-colors"
                      onClick={() => onResourceClick?.(resource)}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[resource.status] || 'bg-gray-400'}`} />
                      <ResourceIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground w-24 truncate shrink-0">{resource.kind}</span>
                      <span className="text-xs text-foreground truncate flex-1">{resource.name}</span>
                      {resource.message && (
                        <span className={`text-[10px] shrink-0 ${STATUS_COLORS[resource.status] || 'text-gray-400'}`}>
                          {resource.message}
                        </span>
                      )}
                      {resource.optional && (
                        <span className="text-[10px] text-muted-foreground/50 shrink-0">opt</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
