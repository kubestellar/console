import { useTranslation } from 'react-i18next'
import { Trash2, GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import type { SidebarItem } from '../../../hooks/useSidebarConfig'
import { cn } from '../../../lib/cn'

interface SortableItemProps {
  item: SidebarItem
  onRemove: (id: string) => void
  renderIcon: (iconName: string, className?: string) => ReactNode
}

export function SortableItem({ item, onRemove, renderIcon }: SortableItemProps) {
  const { t } = useTranslation(['common', 'cards'])
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg bg-secondary/30 cursor-grab active:cursor-grabbing touch-none',
        item.isCustom && 'border border-purple-500/20',
        isDragging && 'shadow-lg'
      )}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
      {renderIcon(item.icon, 'w-4 h-4 text-muted-foreground shrink-0')}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <span className="text-sm text-foreground truncate">{item.name}</span>
        <span className="text-xs text-muted-foreground/50 truncate">{item.href}</span>
      </div>
      {item.href !== '/' && (
        <button
          onClick={(event) => {
            event.stopPropagation()
            onRemove(item.id)
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 shrink-0"
          title={t('sidebar.removeFromSidebar')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
