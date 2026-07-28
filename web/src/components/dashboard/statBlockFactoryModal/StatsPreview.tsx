import { Activity } from 'lucide-react'
import { COLOR_CLASSES } from '../../../lib/stats/types'
import type { BlockEditorItem } from './types'
import { DEMO_STAT_VALUE, getIcon } from './utils'

interface StatsPreviewProps {
  title: string
  blocks: BlockEditorItem[]
}

export function StatsPreview({ title, blocks }: StatsPreviewProps) {
  const visibleBlocks = blocks.filter(block => block.label.trim())

  if (visibleBlocks.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground/40">
        <Activity className="w-6 h-6 mr-2" />
        <span className="text-sm">Add blocks to see preview</span>
      </div>
    )
  }

  const gridCols =
    visibleBlocks.length <= 4
      ? 'grid-cols-2 md:grid-cols-4'
      : visibleBlocks.length <= 6
        ? 'grid-cols-3 md:grid-cols-6'
        : 'grid-cols-4 lg:grid-cols-8'

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">{title || 'Stats Overview'}</span>
      </div>
      <div className={`grid ${gridCols} gap-4`}>
        {visibleBlocks.map(block => {
          const IconComponent = getIcon(block.icon)
          const colorClass = COLOR_CLASSES[block.color] || 'text-foreground'

          return (
            <div key={block.id} className="glass p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <IconComponent className={`w-5 h-5 shrink-0 ${colorClass}`} />
                <span className="text-sm text-muted-foreground truncate">{block.label}</span>
              </div>
              <div className="text-3xl font-bold text-foreground">{DEMO_STAT_VALUE}</div>
              {block.field && <div className="text-xs text-muted-foreground">{block.field}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
