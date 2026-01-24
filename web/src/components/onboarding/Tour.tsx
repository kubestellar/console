import { useEffect, useState, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { useTour, TourStep } from '../../hooks/useTour'
import { useMissions } from '../../hooks/useMissions'
import { cn } from '../../lib/cn'

// KubeStellar logo with AI sparkle effect
function KubeStellarAIIcon({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <img
        src="/kubestellar-logo.svg"
        alt=""
        className="w-full h-full"
      />
      <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-purple-400 animate-pulse" />
    </div>
  )
}

interface TooltipPosition {
  top?: number
  bottom?: number
  left?: number
  right?: number
  // For clamping without CSS transform conflicts
  useAbsoluteLeft?: boolean
}

const TOOLTIP_WIDTH = 320 // w-80 = 20rem = 320px
const TOOLTIP_HEIGHT = 300 // Approximate height including all content (header + content + footer + keyboard hints)
const VIEWPORT_PADDING = 16 // Minimum distance from viewport edge

function getTooltipPosition(
  targetRect: DOMRect,
  placement: TourStep['placement']
): TooltipPosition {
  const gap = 12
  // Use clientWidth to exclude scrollbar width for accurate positioning
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight

  let position: TooltipPosition = {}

  switch (placement) {
    case 'top': {
      // Position above target, centered horizontally
      const targetCenterX = targetRect.left + targetRect.width / 2

      // Check if near right edge - use absolute right positioning instead of transform
      const distanceFromRight = vw - targetCenterX
      const distanceFromLeft = targetCenterX

      // Check if there's room above, otherwise flip to bottom
      const spaceAbove = targetRect.top - gap - VIEWPORT_PADDING
      const spaceBelow = vh - targetRect.bottom - gap - VIEWPORT_PADDING
      const verticalPos = spaceAbove < TOOLTIP_HEIGHT && spaceBelow > TOOLTIP_HEIGHT
        ? { top: targetRect.bottom + gap }
        : { bottom: vh - targetRect.top + gap }

      if (distanceFromRight < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        // Near right edge - use absolute right positioning (no transform needed)
        position = {
          ...verticalPos,
          right: VIEWPORT_PADDING,
          useAbsoluteLeft: true, // Signal to not use transform
        }
      } else if (distanceFromLeft < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        // Near left edge - use absolute left positioning (no transform needed)
        position = {
          ...verticalPos,
          left: VIEWPORT_PADDING,
          useAbsoluteLeft: true,
        }
      } else {
        // Centered positioning with transform
        position = {
          ...verticalPos,
          left: targetCenterX,
        }
      }
      break
    }
    case 'bottom': {
      // Position below target, centered horizontally
      const targetCenterX = targetRect.left + targetRect.width / 2

      // Check if near right edge - use absolute right positioning instead of transform
      const distanceFromRight = vw - targetCenterX
      const distanceFromLeft = targetCenterX

      // Check if there's room below (with buffer), otherwise flip to top
      const spaceBelow = vh - targetRect.bottom - gap - VIEWPORT_PADDING
      const spaceAbove = targetRect.top - gap - VIEWPORT_PADDING
      let verticalPos: { top?: number; bottom?: number }
      if (spaceBelow < TOOLTIP_HEIGHT && spaceAbove > TOOLTIP_HEIGHT) {
        // Flip to top
        verticalPos = { bottom: vh - targetRect.top + gap }
      } else if (spaceBelow < TOOLTIP_HEIGHT && spaceAbove <= TOOLTIP_HEIGHT) {
        // Neither above nor below has enough space - position so tooltip bottom is at viewport edge
        verticalPos = { top: Math.max(VIEWPORT_PADDING, vh - TOOLTIP_HEIGHT - VIEWPORT_PADDING) }
      } else {
        verticalPos = { top: targetRect.bottom + gap }
      }

      if (distanceFromRight < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        // Near right edge - use absolute right positioning (no transform needed)
        position = {
          ...verticalPos,
          right: VIEWPORT_PADDING,
          useAbsoluteLeft: true, // Signal to not use transform
        }
      } else if (distanceFromLeft < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        // Near left edge - use absolute left positioning (no transform needed)
        position = {
          ...verticalPos,
          left: VIEWPORT_PADDING,
          useAbsoluteLeft: true,
        }
      } else {
        // Centered positioning with transform
        position = {
          ...verticalPos,
          left: targetCenterX,
        }
      }
      break
    }
    case 'left': {
      // Position to the left of target
      // For navbar items at the top, position tooltip top near the target top
      // This avoids centering which pushes it down
      let top = targetRect.top + targetRect.height / 2

      // For items near the top of the viewport (like navbar), align tooltip top with target
      // instead of centering. This keeps the tooltip near the top of the page.
      const isNearTop = targetRect.top < 100
      if (isNearTop) {
        // Align top of tooltip with top of target, with small offset
        top = targetRect.top - 10
        // Ensure it doesn't go above viewport
        top = Math.max(VIEWPORT_PADDING, top)
      } else {
        // For other elements, use centered positioning with clamping
        const effectiveHalfHeight = TOOLTIP_HEIGHT / 2 + 20
        const minTop = effectiveHalfHeight + VIEWPORT_PADDING
        const maxTop = vh - effectiveHalfHeight - VIEWPORT_PADDING
        top = Math.max(minTop, Math.min(maxTop, top))
      }

      // Use smaller gap for left placement (closer to target)
      const leftGap = 8
      // Check if there's room to the left, otherwise flip to right
      const spaceLeft = targetRect.left - leftGap
      if (spaceLeft < TOOLTIP_WIDTH && (vw - targetRect.right - leftGap) > TOOLTIP_WIDTH) {
        // Flip to right
        position = {
          top,
          left: targetRect.right + leftGap,
          useAbsoluteLeft: isNearTop, // Don't use transform for top-aligned items
        }
      } else {
        position = {
          top,
          right: vw - targetRect.left + leftGap,
          useAbsoluteLeft: isNearTop, // Don't use transform for top-aligned items
        }
      }
      break
    }
    case 'right': {
      // Position to the right of target, centered vertically
      let top = targetRect.top + targetRect.height / 2
      // More conservative clamping - account for actual rendered height being potentially larger
      const effectiveHalfHeight = TOOLTIP_HEIGHT / 2 + 20 // Extra buffer for safety
      const minTop = effectiveHalfHeight + VIEWPORT_PADDING
      const maxTop = vh - effectiveHalfHeight - VIEWPORT_PADDING
      top = Math.max(minTop, Math.min(maxTop, top))

      // Check if there's room to the right, otherwise flip to left
      const spaceRight = vw - targetRect.right - gap
      if (spaceRight < TOOLTIP_WIDTH && (targetRect.left - gap) > TOOLTIP_WIDTH) {
        // Flip to left
        position = {
          top,
          right: vw - targetRect.left + gap,
        }
      } else {
        position = {
          top,
          left: targetRect.right + gap,
        }
      }
      break
    }
    default: {
      // Default to bottom placement with same logic as 'bottom' case
      const targetCenterX = targetRect.left + targetRect.width / 2
      const distanceFromRight = vw - targetCenterX
      const distanceFromLeft = targetCenterX

      const spaceBelow = vh - targetRect.bottom - gap - VIEWPORT_PADDING
      const spaceAbove = targetRect.top - gap - VIEWPORT_PADDING
      const verticalPos = spaceBelow < TOOLTIP_HEIGHT && spaceAbove > TOOLTIP_HEIGHT
        ? { bottom: vh - targetRect.top + gap }
        : { top: targetRect.bottom + gap }

      if (distanceFromRight < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        position = {
          ...verticalPos,
          right: VIEWPORT_PADDING,
          useAbsoluteLeft: true,
        }
      } else if (distanceFromLeft < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        position = {
          ...verticalPos,
          left: VIEWPORT_PADDING,
          useAbsoluteLeft: true,
        }
      } else {
        position = {
          ...verticalPos,
          left: targetCenterX,
        }
      }
    }
  }

  return position
}

export function TourOverlay() {
  const {
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps,
    nextStep,
    prevStep,
    skipTour,
  } = useTour()
  const { openSidebar: openMissionSidebar, closeSidebar: closeMissionSidebar } = useMissions()

  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({})
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isActive || !currentStep) return

    let isCancelled = false
    const timeoutIds: ReturnType<typeof setTimeout>[] = []

    // Function to position tooltip based on current target position
    const positionTooltip = () => {
      if (isCancelled) return
      const target = document.querySelector(currentStep.target)
      if (target) {
        const rect = target.getBoundingClientRect()
        setTargetRect(rect)
        setTooltipPosition(getTooltipPosition(rect, currentStep.placement))
      }
    }

    // Small delay to allow DOM to render
    timeoutIds.push(setTimeout(() => {
      const target = document.querySelector(currentStep.target)
      if (target) {
        // Check if target is in viewport
        const rect = target.getBoundingClientRect()
        const isInViewport =
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth

        if (!isInViewport) {
          // Scroll target into view first
          target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
          // Wait for scroll to complete, then position tooltip
          timeoutIds.push(setTimeout(positionTooltip, 400))
        } else {
          // Target already visible, position immediately
          positionTooltip()
        }
      } else {
        // Center the tooltip when target not found
        setTargetRect(null)
        setTooltipPosition({
          top: window.innerHeight / 2 - 100,
          left: window.innerWidth / 2,
        })
      }
    }, 100))

    // For steps that may have layout shifts (e.g., after sidebar closes),
    // reposition after a longer delay to catch the final layout
    if (currentStep.id === 'add-card' || currentStep.id === 'templates') {
      timeoutIds.push(setTimeout(positionTooltip, 500))
    }

    // Reposition on window resize
    const handleResize = () => positionTooltip()
    window.addEventListener('resize', handleResize)

    return () => {
      isCancelled = true
      timeoutIds.forEach(id => clearTimeout(id))
      window.removeEventListener('resize', handleResize)
    }
  }, [isActive, currentStep, currentStepIndex])

  // Handle escape key
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipTour()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        nextStep()
      } else if (e.key === 'ArrowLeft') {
        prevStep()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, nextStep, prevStep, skipTour])

  // Open mission sidebar when on the AI Missions step
  useEffect(() => {
    if (!isActive || !currentStep) return

    if (currentStep.id === 'ai-missions') {
      openMissionSidebar()
    }

    return () => {
      // Close sidebar when leaving the AI Missions step
      if (currentStep.id === 'ai-missions') {
        closeMissionSidebar()
      }
    }
  }, [isActive, currentStep, openMissionSidebar, closeMissionSidebar])

  if (!isActive || !currentStep) return null

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Overlay with cutout for target */}
      {targetRect && currentStep.highlight ? (
        // Use box-shadow trick to create cutout - the highlighted area stays clear
        <div
          className="absolute border-4 border-purple-500 rounded-lg animate-pulse pointer-events-none"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
          }}
        />
      ) : (
        // No target found - show full overlay
        <div className="absolute inset-0 bg-black/75" />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={cn(
          'absolute z-10 w-80 p-4 rounded-lg glass border border-purple-500/30 shadow-xl animate-fade-in-up pointer-events-auto',
          // Center horizontally only for top/bottom placements when NOT using absolute edge positioning
          (currentStep.placement === 'top' || currentStep.placement === 'bottom' || !currentStep.placement) &&
            !tooltipPosition.useAbsoluteLeft && '-translate-x-1/2',
          // Center vertically for left/right placements, unless using absolute positioning (navbar items)
          (currentStep.placement === 'left' || currentStep.placement === 'right') &&
            !tooltipPosition.useAbsoluteLeft && '-translate-y-1/2'
        )}
        style={{
          top: tooltipPosition.top,
          bottom: tooltipPosition.bottom,
          left: tooltipPosition.left,
          right: tooltipPosition.right,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-500/20">
              <KubeStellarAIIcon className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-foreground">{currentStep.title}</h3>
          </div>
          <button
            onClick={skipTour}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <p className="text-sm text-muted-foreground mb-4">{currentStep.content}</p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          {/* Progress dots */}
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'w-2 h-2 rounded-full transition-colors',
                  i === currentStepIndex
                    ? 'bg-purple-500'
                    : i < currentStepIndex
                    ? 'bg-purple-500/50'
                    : 'bg-secondary'
                )}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <button
                onClick={prevStep}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={nextStep}
              className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-foreground text-sm font-medium transition-colors flex items-center gap-1"
            >
              {currentStepIndex === totalSteps - 1 ? (
                'Finish'
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Keyboard hints */}
        <div className="mt-3 pt-2 border-t border-border/50 text-xs text-muted-foreground flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 rounded bg-secondary">←</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-secondary">→</kbd>
          <span>to navigate</span>
          <kbd className="px-1.5 py-0.5 rounded bg-secondary ml-2">Esc</kbd>
          <span>to skip</span>
        </div>
      </div>
    </div>
  )
}

// Button to start the tour from settings or navbar
export function TourTrigger() {
  const { startTour, hasCompletedTour } = useTour()

  return (
    <button
      onClick={startTour}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
        hasCompletedTour
          ? 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 animate-pulse'
      )}
      title="Take a tour"
    >
      <KubeStellarAIIcon className="w-5 h-5" />
      {!hasCompletedTour && <span>Take the tour</span>}
    </button>
  )
}

// Auto-start tour prompt for new users
export function TourPrompt() {
  const { hasCompletedTour, isActive, startTour, skipTour } = useTour()
  const [dismissed, setDismissed] = useState(false)

  // Don't show if tour completed, dismissed, or already active
  if (hasCompletedTour || dismissed || isActive) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 p-4 glass rounded-lg border border-purple-500/30 shadow-xl animate-fade-in-up">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-purple-500/20 flex-shrink-0">
          <KubeStellarAIIcon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground mb-1">Welcome!</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Would you like a quick tour of the console? Learn about AI features, drill-down navigation, and more.
          </p>
          <div className="flex gap-2">
            <button
              onClick={startTour}
              className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-foreground text-sm font-medium transition-colors"
            >
              Start Tour
            </button>
            <button
              onClick={() => {
                setDismissed(true)
                skipTour()
              }}
              className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
