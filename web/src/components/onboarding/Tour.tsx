import { useEffect, useState, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { useTour, TourStep } from '../../hooks/useTour'
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
}

function getTooltipPosition(
  targetRect: DOMRect,
  placement: TourStep['placement']
): TooltipPosition {
  const gap = 12

  switch (placement) {
    case 'top':
      return {
        bottom: window.innerHeight - targetRect.top + gap,
        left: targetRect.left + targetRect.width / 2,
      }
    case 'bottom':
      return {
        top: targetRect.bottom + gap,
        left: targetRect.left + targetRect.width / 2,
      }
    case 'left':
      return {
        top: targetRect.top + targetRect.height / 2,
        right: window.innerWidth - targetRect.left + gap,
      }
    case 'right':
      return {
        top: targetRect.top + targetRect.height / 2,
        left: targetRect.right + gap,
      }
    default:
      return {
        top: targetRect.bottom + gap,
        left: targetRect.left + targetRect.width / 2,
      }
  }
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

  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({})
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isActive || !currentStep) return

    // Small delay to allow DOM to render
    const timeoutId = setTimeout(() => {
      const target = document.querySelector(currentStep.target)
      if (target) {
        const rect = target.getBoundingClientRect()
        setTargetRect(rect)
        setTooltipPosition(getTooltipPosition(rect, currentStep.placement))

        // Scroll target into view if needed
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        // Center the tooltip when target not found
        setTargetRect(null)
        setTooltipPosition({
          top: window.innerHeight / 2 - 100,
          left: window.innerWidth / 2,
        })
      }
    }, 100)

    return () => clearTimeout(timeoutId)
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

  if (!isActive || !currentStep) return null

  return (
    <div className="fixed inset-0 z-[100]">
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
          'absolute z-10 w-80 p-4 rounded-lg glass border border-purple-500/30 shadow-xl animate-fade-in-up',
          '-translate-x-1/2',
          (currentStep.placement === 'left' || currentStep.placement === 'right') && '-translate-y-1/2'
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
            <h3 className="font-semibold text-white">{currentStep.title}</h3>
          </div>
          <button
            onClick={skipTour}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-white"
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
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={nextStep}
              className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium transition-colors flex items-center gap-1"
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
          ? 'text-muted-foreground hover:text-white hover:bg-secondary/50'
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
  const { hasCompletedTour, startTour, skipTour } = useTour()
  const [dismissed, setDismissed] = useState(false)

  // Don't show if tour completed or dismissed
  if (hasCompletedTour || dismissed) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 p-4 glass rounded-lg border border-purple-500/30 shadow-xl animate-fade-in-up">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-purple-500/20 flex-shrink-0">
          <KubeStellarAIIcon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1">Welcome!</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Would you like a quick tour of the console? Learn about AI features, drill-down navigation, and more.
          </p>
          <div className="flex gap-2">
            <button
              onClick={startTour}
              className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
            >
              Start Tour
            </button>
            <button
              onClick={() => {
                setDismissed(true)
                skipTour()
              }}
              className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-white text-sm transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
