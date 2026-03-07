import { Zap } from 'lucide-react'
import { StatusBadge } from '../../ui/StatusBadge'
import type { InsightSource } from '../../../types/insights'

interface InsightSourceBadgeProps {
  source: InsightSource
  confidence?: number
}

export function InsightSourceBadge({ source, confidence }: InsightSourceBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1">
      {source === 'ai' ? (
        <StatusBadge color="blue" size="xs" className="flex-shrink-0">
          AI
        </StatusBadge>
      ) : (
        <StatusBadge color="gray" size="xs" className="flex-shrink-0">
          <Zap className="w-2 h-2" />
        </StatusBadge>
      )}
      {confidence !== undefined && (
        <span className="text-[9px] text-muted-foreground">{confidence}%</span>
      )}
    </span>
  )
}
