import { memo, useEffect } from 'react'
import { Eye } from 'lucide-react'
import type { ChangeType, ResourceListItem, ResourceType } from '../NamespaceMonitor.types'
import { ChangeAnimations, MAX_VISIBLE_ITEMS, ResourceColors, ResourceIcons } from '../NamespaceMonitor.utils'

interface ResourceSectionProps {
  type: ResourceType
  items: ResourceListItem[]
  cluster: string
  namespace: string
  getResourceChange: (cluster: string, namespace: string, type: ResourceType, name: string) => ChangeType
  clearChangeAfterTimeout: (key: string) => void
  onItemClick: (name: string) => void
  onItemAction: (name: string) => void
}

/** Per-item row that schedules change-animation cleanup in useEffect instead
 *  of firing the side-effect during render. */
function ResourceItemRow({
  item, cluster, namespace, type, getResourceChange, clearChangeAfterTimeout, onItemClick, onItemAction,
}: {
  item: ResourceListItem
  cluster: string
  namespace: string
  type: ResourceType
  getResourceChange: ResourceSectionProps['getResourceChange']
  clearChangeAfterTimeout: ResourceSectionProps['clearChangeAfterTimeout']
  onItemClick: (name: string) => void
  onItemAction: (name: string) => void
}) {
  const changeType = getResourceChange(cluster, namespace, type, item.name)
  const changeKey = `${cluster}:${namespace}:${type}:${item.name}`

  useEffect(() => {
    if (changeType) {
      clearChangeAfterTimeout(changeKey)
    }
  }, [changeType, changeKey, clearChangeAfterTimeout])

  return (
    <div
      className={`flex items-center gap-2 py-1 px-2 rounded text-xs group transition-all border border-transparent ${
        changeType ? ChangeAnimations[changeType] : 'hover:bg-secondary/50'
      }`}
    >
      <span
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
        className={`flex-1 truncate cursor-pointer hover:text-purple-400 ${
          item.healthy ? 'text-foreground' : 'text-yellow-400'
        }`}
        onClick={() => onItemClick(item.name)}
      >
        {item.name}
      </span>
      <span
        className={`text-2xs px-1.5 py-0.5 rounded ${
          item.healthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
        }`}
      >
        {item.status}
      </span>
      <button
        onClick={event => {
          event.stopPropagation()
          onItemAction(item.name)
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-secondary rounded transition-opacity"
      >
        <Eye className="w-3 h-3 text-muted-foreground" />
      </button>
    </div>
  )
}

function ResourceSectionComponent({
  type,
  items,
  cluster,
  namespace,
  getResourceChange,
  clearChangeAfterTimeout,
  onItemClick,
  onItemAction,
}: ResourceSectionProps) {
  const Icon = ResourceIcons[type]
  const color = ResourceColors[type]

  return (
    <div className="py-1 px-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className={`w-3 h-3 ${color}`} />
        <span className="capitalize">{type}</span>
        <span>({items.length})</span>
      </div>
      <div className="space-y-0.5">
        {(items || []).slice(0, MAX_VISIBLE_ITEMS).map(item => (
          <ResourceItemRow
            key={item.name}
            item={item}
            cluster={cluster}
            namespace={namespace}
            type={type}
            getResourceChange={getResourceChange}
            clearChangeAfterTimeout={clearChangeAfterTimeout}
            onItemClick={onItemClick}
            onItemAction={onItemAction}
          />
        ))}
        {items.length > MAX_VISIBLE_ITEMS && (
          <div className="text-2xs text-muted-foreground px-2 py-1">+{items.length - MAX_VISIBLE_ITEMS} more</div>
        )}
      </div>
    </div>
  )
}

export const ResourceSection = memo(ResourceSectionComponent)
