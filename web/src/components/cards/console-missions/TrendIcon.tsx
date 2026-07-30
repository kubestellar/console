/**
 * TrendIcon — Small icon indicating trend direction (worsening, improving, stable).
 */
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { TrendDirection } from '../../../types/predictions'

export function TrendIcon({ trend, className }: { trend?: TrendDirection; className?: string }) {
  if (!trend || trend === 'stable') {
    return (
      <span title="Stable">
        <Minus className={cn('w-3 h-3 text-muted-foreground', className)} />
      </span>
    )
  }
  if (trend === 'worsening') {
    return (
      <span title="Worsening">
        <TrendingUp className={cn('w-3 h-3 text-orange-400', className)} />
      </span>
    )
  }
  return (
    <span title="Improving">
      <TrendingDown className={cn('w-3 h-3 text-green-400', className)} />
    </span>
  )
}
