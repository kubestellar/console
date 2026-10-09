import type { KeyboardEvent, RefObject } from 'react'
import { ChevronRight, MoveHorizontal } from 'lucide-react'
import { cn } from '../../../lib/cn'

interface ResizeOption {
  value: number
  label: string
  desc: string
}

interface ResizeSubmenuProps {
  containerRef: RefObject<HTMLDivElement | null>
  submenuRef: RefObject<HTMLDivElement | null>
  menuId: string
  isOpen: boolean
  onLeft: boolean
  onOpen: () => void
  onClose: () => void
  onCloseSibling: () => void
  onCloseRoot: () => void
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
  options: ResizeOption[]
  currentValue?: number
  onChange: (value: number) => void
  label: string
  tooltip: string
  iconClassName?: string
}

/** Menu item with a flyout list of size options (used for card width and height). */
export function ResizeSubmenu({
  containerRef, submenuRef, menuId, isOpen, onLeft, onOpen, onClose, onCloseSibling, onCloseRoot,
  onKeyDown, options, currentValue, onChange, label, tooltip, iconClassName,
}: ResizeSubmenuProps) {
  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => { if (isOpen) { onClose() } else { onOpen() } onCloseSibling() }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            onOpen()
            onCloseSibling()
          }
        }}
        className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex flex-wrap items-center justify-between gap-y-2"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        title={tooltip}
      >
        <span className="flex items-center gap-2">
          <MoveHorizontal className={cn('w-4 h-4', iconClassName)} aria-hidden="true" />
          {label}
        </span>
        <ChevronRight className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-90')} aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          id={menuId}
          ref={submenuRef}
          className={cn('absolute top-0 w-36 glass rounded-lg py-1 z-20', onLeft ? 'right-full mr-1' : 'left-full ml-1')}
          role="menu"
          aria-label={tooltip}
          onKeyDown={onKeyDown}
        >
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => { onChange(option.value); onClose(); onCloseRoot() }}
              className={cn(
                'w-full px-3 py-2 text-left text-sm flex flex-wrap items-center justify-between gap-y-2',
                currentValue === option.value
                  ? 'text-purple-400 bg-purple-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
              role="menuitem"
            >
              <span>{option.label}</span>
              <span className="text-xs opacity-60">{option.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
