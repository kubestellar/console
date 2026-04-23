/**
 * FeatureHintTooltip — small, dismissible inline tooltip for feature discovery.
 *
 * Positioned relative to its parent (parent must be `position: relative`).
 * Appears once per user, auto-dismisses after a timeout set by useFeatureHints.
 */

import { X } from 'lucide-react'
import { Button } from './Button'

type Placement = 'top' | 'bottom' | 'bottom-right' | 'left' | 'right'

interface FeatureHintTooltipProps {
  message: string
  onDismiss: () => void
  placement?: Placement
}

const PLACEMENT_CLASSES: Record<Placement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  'bottom-right': 'top-full right-0 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

export function FeatureHintTooltip({
  message,
  onDismiss,
  placement = 'bottom',
}: FeatureHintTooltipProps) {
  return (
    <div
      className={`absolute z-toast ${PLACEMENT_CLASSES[placement]} animate-in fade-in slide-in-from-top-1 duration-300`}
      role="tooltip"
    >
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg glass border border-purple-500/30 bg-purple-500/10 shadow-lg w-72">
        <span className="text-xs text-purple-300 leading-tight">{message}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="shrink-0 p-0.5 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300"
          aria-label="Dismiss hint"
          icon={<X className="w-3 h-3" />}
        />
      </div>
    </div>
  )
}
