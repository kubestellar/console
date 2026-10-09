import { useTranslation } from 'react-i18next'
import { GripVertical, Eye, EyeOff, Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from './Button'
import type { StatBlockConfig, DashboardStatsType } from './StatsBlockDefinitions'
import { colorClasses, iconEmojis } from './StatsConfig.constants'

interface SortableItemProps {
  block: StatBlockConfig
  onToggleVisibility: (id: string) => void
  onRemove?: (id: string) => void
  isCustom?: boolean
}

export function SortableItem({ block, onToggleVisibility, onRemove, isCustom }: SortableItemProps) {
  const { t } = useTranslation()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg bg-secondary/30 ${
        block.visible ? '' : 'opacity-50'
      }`}
    >
      <Button
        variant="ghost"
        size="sm"
        className="cursor-grab active:cursor-grabbing p-1"
        icon={<GripVertical className="w-4 h-4 text-muted-foreground" />}
        {...attributes}
        {...listeners}
      />
      <div className={`w-5 h-5 ${colorClasses[block.color] || 'text-foreground'}`}>
        <span className="text-sm">{iconEmojis[block.icon] || '📊'}</span>
      </div>
      <span className="flex-1 text-sm text-foreground">{block.name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggleVisibility(block.id)}
        className={`p-1 ${
          block.visible
            ? 'text-green-400'
            : 'text-muted-foreground'
        }`}
        title={block.visible ? 'Hide' : 'Show'}
        icon={block.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      />
      {isCustom && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(block.id)}
          className="p-1 hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
          title={t('common.remove')}
          icon={<Trash2 className="w-4 h-4" />}
        />
      )}
    </div>
  )
}

interface AvailableStatItemProps {
  block: StatBlockConfig
  onAdd: (block: StatBlockConfig) => void
}

export function AvailableStatItem({ block, onAdd }: AvailableStatItemProps) {
  return (
    <Button
      variant="ghost"
      size="md"
      onClick={() => onAdd(block)}
      className="w-full justify-start pl-8 rounded-lg"
      fullWidth
      iconRight={<Plus className="w-4 h-4 text-muted-foreground" />}
    >
      <div className={`w-5 h-5 ${colorClasses[block.color] || 'text-foreground'}`}>
        <span className="text-sm">{iconEmojis[block.icon] || '📊'}</span>
      </div>
      <span className="flex-1 text-sm text-foreground text-left">{block.name}</span>
    </Button>
  )
}

interface DashboardCategoryProps {
  category: { type: DashboardStatsType; name: string; icon: string }
  availableBlocks: StatBlockConfig[]
  onAdd: (block: StatBlockConfig) => void
  isExpanded: boolean
  onToggle: () => void
}

export function DashboardCategory({ category, availableBlocks, onAdd, isExpanded, onToggle }: DashboardCategoryProps) {
  if (availableBlocks.length === 0) return null

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <Button
        variant="ghost"
        size="md"
        onClick={onToggle}
        className="w-full justify-start"
        fullWidth
        icon={isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        iconRight={<span className="text-xs text-muted-foreground">{availableBlocks.length}</span>}
      >
        <span className="text-base">{category.icon}</span>
        <span className="flex-1 text-sm font-medium text-foreground text-left">{category.name}</span>
      </Button>
      {isExpanded && (
        <div className="border-l-2 border-purple-500/30 ml-2">
          {availableBlocks.map(block => (
            <AvailableStatItem key={block.id} block={block} onAdd={onAdd} />
          ))}
        </div>
      )}
    </div>
  )
}
