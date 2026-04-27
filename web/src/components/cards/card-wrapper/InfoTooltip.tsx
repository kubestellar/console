import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// #6227: shared Escape-key coordinator. Multiple InfoTooltips (one per
// CardWrapper) used to each register their own document-level keydown
// listener; pressing Escape would fire ALL of them and close every open
// tooltip on the dashboard at once. Now each tooltip pushes its close
// callback onto a shared LIFO stack and only the topmost (most recently
// opened) callback runs. A single document listener is registered on the
// first push and removed on the last pop.
const escapeStack: Array<() => void> = []
let escapeListenerAttached = false
function handleGlobalEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape' || escapeStack.length === 0) return
  const top = escapeStack[escapeStack.length - 1]
  // stopImmediatePropagation prevents any other peer keydown listeners
  // (e.g. DrillDownModal) from firing on the same event when an
  // InfoTooltip is the topmost element.
  e.stopImmediatePropagation()
  top()
}
function pushEscapeHandler(close: () => void): () => void {
  escapeStack.push(close)
  if (!escapeListenerAttached) {
    document.addEventListener('keydown', handleGlobalEscape, true)
    escapeListenerAttached = true
  }
  return () => {
    const idx = escapeStack.lastIndexOf(close)
    if (idx >= 0) escapeStack.splice(idx, 1)
    if (escapeStack.length === 0 && escapeListenerAttached) {
      document.removeEventListener('keydown', handleGlobalEscape, true)
      escapeListenerAttached = false
    }
  }
}

/** Tooltip width in pixels (max-w-xs = 320px) */
const TOOLTIP_WIDTH_PX = 320
/** Estimated tooltip height when actual height is unknown */
const TOOLTIP_HEIGHT_ESTIMATE_PX = 80
/** Viewport edge margin in pixels */
const TOOLTIP_EDGE_MARGIN_PX = 8

/**
 * Info tooltip that renders via portal to escape overflow-hidden containers.
 * Updates position on scroll to stay attached to the trigger element.
 */
export function InfoTooltip({ text }: { text: string }) {
  const { t } = useTranslation('cards')
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const tooltipId = `info-tooltip-${Math.random().toString(36).slice(2, 9)}`

  // Update position based on trigger element's current bounding rect
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !isVisible) return

    const rect = triggerRef.current.getBoundingClientRect()
    const tooltipHeight = tooltipRef.current?.offsetHeight || TOOLTIP_HEIGHT_ESTIMATE_PX

    // Position below the icon by default
    let top = rect.bottom + TOOLTIP_EDGE_MARGIN_PX
    let left = rect.left - (TOOLTIP_WIDTH_PX / 2) + (rect.width / 2)

    // Ensure tooltip stays within viewport
    if (left < TOOLTIP_EDGE_MARGIN_PX) left = TOOLTIP_EDGE_MARGIN_PX
    if (left + TOOLTIP_WIDTH_PX > window.innerWidth - TOOLTIP_EDGE_MARGIN_PX) {
      left = window.innerWidth - TOOLTIP_WIDTH_PX - TOOLTIP_EDGE_MARGIN_PX
    }

    // If tooltip would go below viewport, position above
    if (top + tooltipHeight > window.innerHeight - TOOLTIP_EDGE_MARGIN_PX) {
      top = rect.top - tooltipHeight - TOOLTIP_EDGE_MARGIN_PX
    }

    setPosition({ top, left })
  }, [isVisible])

  // Update position on scroll and resize
  useEffect(() => {
    if (!isVisible) return

    updatePosition()

    // Update on scroll (any scrollable ancestor)
    const handleScroll = () => updatePosition()
    const handleResize = () => updatePosition()

    window.addEventListener('scroll', handleScroll, true) // capture phase for nested scrolls
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [isVisible, updatePosition])

  // Close tooltip when clicking outside or pressing Escape
  // #6227: Escape is routed through the shared escapeStack so only the
  // topmost open tooltip closes — used to fire on every mounted tooltip.
  useEffect(() => {
    if (!isVisible) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!triggerRef.current?.contains(target) && !tooltipRef.current?.contains(target)) {
        setIsVisible(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    const popEscape = pushEscapeHandler(() => setIsVisible(false))
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      popEscape()
    }
  }, [isVisible])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsVisible(!isVisible)}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        aria-label={t('cardWrapper.cardInfo')}
        aria-describedby={isVisible ? tooltipId : undefined}
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {isVisible && position && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="fixed z-dropdown max-w-xs px-3 py-2.5 text-xs leading-relaxed rounded-lg bg-background border border-border text-foreground shadow-xl animate-fade-in"
          style={{ top: position.top, left: position.left }}
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  )
}
