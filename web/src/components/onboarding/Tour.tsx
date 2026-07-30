import { useEffect, useState, useRef } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTour } from '../../hooks/useTour'
import { cn } from '../../lib/cn'
import { TOOLTIP_POSITION_DELAY_MS } from '../../lib/constants/network'
import { LogoWithStar } from '../ui/LogoWithStar'
import { Button } from '../ui/Button'
import { type TooltipPosition, getTooltipPosition } from './Tour.parts'

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
  const [overlay, setOverlay] = useState<{ position: TooltipPosition; rect: DOMRect | null }>({ position: {}, rect: null })
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
        setOverlay({ rect, position: getTooltipPosition(rect, currentStep.placement) })
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
          timeoutIds.push(setTimeout(positionTooltip, TOOLTIP_POSITION_DELAY_MS))
        } else {
          // Target already visible, position immediately
          positionTooltip()
        }
      } else {
        // Center the tooltip when target not found
        setOverlay({
          rect: null,
          position: {
            top: window.innerHeight / 2 - 100,
            left: window.innerWidth / 2,
          },
        })
      }
    }, 100))

    // Reposition on window resize and scroll so the tooltip stays
    // anchored to its target element (#5411).
    const handleReposition = () => positionTooltip()
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, { capture: true, passive: true })

    return () => {
      isCancelled = true
      timeoutIds.forEach(id => clearTimeout(id))
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, { capture: true })
    }
  }, [isActive, currentStep, currentStepIndex])

  // Handle escape key
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipTour()
        return
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable)) return
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        nextStep()
      } else if (e.key === 'ArrowLeft') {
        prevStep()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, nextStep, prevStep, skipTour])

  if (!isActive || !currentStep) return null

  return (
    <div className="fixed inset-0 z-overlay pointer-events-none">
      {/* Overlay with cutout for target */}
      {overlay.rect && currentStep.highlight ? (
        // Use box-shadow trick to create cutout - the highlighted area stays clear.
        // Split into two elements so that animate-pulse only affects the border,
        // not the backdrop (box-shadow), which previously caused the background to blink.
        <>
          {/* Static dark backdrop — no animation so it never blinks */}
          <div
            className="absolute rounded-lg pointer-events-none shadow-tour-overlay"
            style={{
              top: overlay.rect.top - 8,
              left: overlay.rect.left - 8,
              width: overlay.rect.width + 16,
              height: overlay.rect.height + 16,
            }}
          />
          {/* Pulsing border highlight — only the border animates, not the backdrop */}
          <div
            className="absolute border-4 border-purple-500 rounded-lg animate-pulse pointer-events-none"
            style={{
              top: overlay.rect.top - 8,
              left: overlay.rect.left - 8,
              width: overlay.rect.width + 16,
              height: overlay.rect.height + 16,
            }}
          />
        </>
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
            !overlay.position.useAbsoluteLeft && '-translate-x-1/2',
          // Center vertically for left/right placements, unless using absolute positioning (navbar items)
          (currentStep.placement === 'left' || currentStep.placement === 'right') &&
            !overlay.position.useAbsoluteLeft && '-translate-y-1/2'
        )}
        style={{
          top: overlay.position.top,
          bottom: overlay.position.bottom,
          left: overlay.position.left,
          right: overlay.position.right,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-500/20">
              <LogoWithStar className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-foreground">{currentStep.title}</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={skipTour}
            icon={<X className="w-4 h-4" aria-hidden="true" />}
            aria-label="Skip tour"
          />
        </div>

        {/* Content */}
        <div className="text-sm text-muted-foreground mb-4">{currentStep.content}</div>

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
              <Button
                variant="ghost"
                size="sm"
                onClick={prevStep}
                icon={<ChevronLeft className="w-4 h-4" aria-hidden="true" />}
                aria-label="Previous step"
              />
            )}
            <Button
              variant="accent"
              size="md"
              onClick={nextStep}
              iconRight={currentStepIndex < totalSteps - 1 ? <ChevronRight className="w-4 h-4" /> : undefined}
            >
              {currentStepIndex === totalSteps - 1 ? 'Finish' : 'Next'}
            </Button>
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
    <Button
      variant={hasCompletedTour ? 'ghost' : 'accent'}
      size="md"
      onClick={startTour}
      icon={<LogoWithStar className="w-5 h-5" />}
      className={cn(!hasCompletedTour && 'animate-pulse')}
      title="Take a tour"
      aria-label="Take a tour"
    >
      {!hasCompletedTour && <span className="hidden xl:inline">Take the tour</span>}
    </Button>
  )
}

// Tour prompt removed — auto-starting the tour had a 2.5% completion rate
// and annoyed 97.5% of users. The tour is now opt-in only via TourTrigger
// button in the navbar. Feature hints + Getting Started banner handle onboarding.
export function TourPrompt() {
  return null
}
