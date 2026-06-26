import { Zap } from 'lucide-react'
import { StatusBadge } from '../../ui/StatusBadge'
import type { InsightSource } from '../../../types/insights'

interface InsightSourceBadgeProps {
  source: InsightSource
  confidence?: number
}

export function InsightSourceBadge({ source, confidence }: InsightSourceBadgeProps) {
  const label = source === 'ai'
    ? `AI-generated insight${confidence !== undefined ? `, ${confidence}% confidence` : ''}`
    : `Heuristic insight${confidence !== undefined ? `, ${confidence}% confidence` : ''}`

  return (
    <span className="inline-flex items-center gap-1" aria-label={label} title={label}>
      {source === 'ai' ? (
        <StatusBadge color="blue" size="xs" className="shrink-0">
          AI
        </StatusBadge>
      ) : (
        <StatusBadge color="gray" size="xs" className="shrink-0">
          <Zap className="w-2 h-2" aria-hidden="true" />
        </StatusBadge>
      )}
      {confidence !== undefined && (
        <span className="text-[9px] text-muted-foreground">{confidence}%</span>
      )}
    </span>
  )
}
