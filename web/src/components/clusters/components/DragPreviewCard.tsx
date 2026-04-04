import { GripVertical } from 'lucide-react'
import { DashboardCard } from '../../../lib/dashboards'
import { formatCardTitle } from '../../../lib/formatCardTitle'

export interface DragPreviewCardProps {
  card: DashboardCard
}

export function DragPreviewCard({ card }: DragPreviewCardProps) {
  const cardWidth = card.position?.w || 4
  return (
    <div
      className="glass rounded-lg p-4 shadow-xl"
      style={{ width: `${(cardWidth / 12) * 100}%`, minWidth: 200, maxWidth: 400 }}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate">
          {formatCardTitle(card.card_type)}
        </span>
      </div>
    </div>
  )
}
