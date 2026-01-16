import { useState, useEffect } from 'react'
import { Clock, X, ArrowRight, Bell } from 'lucide-react'
import { useSnoozedCards, formatTimeRemaining, SnoozedSwap } from '../../hooks/useSnoozedCards'
import { cn } from '../../lib/cn'

interface SnoozedCardsProps {
  onApplySwap?: (swap: SnoozedSwap) => void
}

export function SnoozedCards({ onApplySwap }: SnoozedCardsProps) {
  const { snoozedSwaps, unsnoozeSwap, dismissSwap } = useSnoozedCards()
  const [, forceUpdate] = useState(0)

  // Update every minute to refresh time remaining
  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  if (snoozedSwaps.length === 0) return null

  const handleApply = (swap: SnoozedSwap) => {
    unsnoozeSwap(swap.id)
    onApplySwap?.(swap)
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 px-3 mb-2">
        <Clock className="w-4 h-4 text-purple-400" />
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Snoozed
        </h4>
        <span className="ml-auto text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
          {snoozedSwaps.length}
        </span>
      </div>
      <div className="space-y-2">
        {snoozedSwaps.map((swap) => (
          <SnoozedItem
            key={swap.id}
            swap={swap}
            onApply={() => handleApply(swap)}
            onDismiss={() => dismissSwap(swap.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface SnoozedItemProps {
  swap: SnoozedSwap
  onApply: () => void
  onDismiss: () => void
}

function SnoozedItem({ swap, onApply, onDismiss }: SnoozedItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const timeRemaining = formatTimeRemaining(swap.snoozedUntil)
  const isExpired = timeRemaining === 'Expired'

  return (
    <div
      className={cn(
        'relative p-2 mx-2 rounded-lg text-xs transition-all duration-200',
        isExpired
          ? 'bg-yellow-500/10 border border-yellow-500/30'
          : 'bg-secondary/30 hover:bg-secondary/50'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-1 right-1 p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-white transition-colors"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Card swap info */}
      <div className="flex items-center gap-1 pr-4 mb-1">
        <span className="text-muted-foreground truncate">{swap.originalCardTitle}</span>
        <ArrowRight className="w-3 h-3 text-purple-400 flex-shrink-0" />
        <span className="text-white truncate">{swap.newCardTitle}</span>
      </div>

      {/* Time remaining and actions */}
      <div className="flex items-center justify-between">
        <span className={cn(
          'flex items-center gap-1',
          isExpired ? 'text-yellow-400' : 'text-muted-foreground'
        )}>
          {isExpired ? (
            <>
              <Bell className="w-3 h-3 animate-pulse" />
              Ready to swap
            </>
          ) : (
            <>
              <Clock className="w-3 h-3" />
              {timeRemaining}
            </>
          )}
        </span>

        {(isHovered || isExpired) && (
          <button
            onClick={onApply}
            className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
          >
            Apply
          </button>
        )}
      </div>

      {/* Reason tooltip on hover */}
      {isHovered && swap.reason && (
        <div className="mt-1 pt-1 border-t border-border/50">
          <p className="text-muted-foreground line-clamp-2">{swap.reason}</p>
        </div>
      )}
    </div>
  )
}
