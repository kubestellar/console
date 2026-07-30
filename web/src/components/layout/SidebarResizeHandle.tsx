import { cn } from '../../lib/cn'

interface SidebarResizeHandleProps {
  showResize: boolean
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  ariaLabel: string
  ariaValueMin: number
  ariaValueMax: number
  ariaValueNow: number
  isResizing: boolean
  top: number
  left: number
  width: number
}

export function SidebarResizeHandle({
  showResize,
  onMouseDown,
  onKeyDown,
  ariaLabel,
  ariaValueMin,
  ariaValueMax,
  ariaValueNow,
  isResizing,
  top,
  left,
  width,
}: SidebarResizeHandleProps) {
  if (!showResize) return null

  return (
    <div
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuemin={ariaValueMin}
      aria-valuemax={ariaValueMax}
      aria-valuenow={ariaValueNow}
      className={cn(
        'fixed bottom-0 hidden cursor-col-resize z-sidebar transition-colors md:block',
        'hover:bg-purple-500/30 focus-visible:bg-purple-500/30 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-purple-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isResizing && 'bg-purple-500/50'
      )}
      style={{ top, left, width }}
    />
  )
}
