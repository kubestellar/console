/**
 * MissionControlDialogStepper — Phase navigation tabs rendered in the dialog header.
 */

import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { PHASE_STEPS } from './MissionControlDialog.constants'
import type { WizardPhase } from './types'

interface MissionControlDialogStepperProps {
  currentPhase: WizardPhase
  currentStepIndex: number
  highestReached: number
  setHighestReached: (n: number) => void
  canAdvance: boolean
  isLaunching: boolean
  isComplete: boolean
  onSetPhase: (phase: WizardPhase) => void
}

export function MissionControlDialogStepper({
  currentPhase,
  currentStepIndex,
  highestReached,
  setHighestReached,
  canAdvance,
  isLaunching,
  isComplete,
  onSetPhase,
}: MissionControlDialogStepperProps) {
  const isLaunchOrComplete = isLaunching || isComplete

  return (
    <nav
      className="hidden md:flex items-center gap-1"
      role="tablist"
      aria-label="Mission control phases"
      onKeyDown={(e) => {
        if (isLaunchOrComplete) return
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const delta = e.key === 'ArrowRight' ? 1 : -1
        // #9501 — Allow ArrowRight to advance beyond highestReached when canAdvance
        const upperBound = (delta > 0 && canAdvance)
          ? Math.min(highestReached + 1, PHASE_STEPS.length - 1)
          : highestReached
        const nextIdx = Math.max(0, Math.min(upperBound, currentStepIndex + delta))
        if (nextIdx !== currentStepIndex) {
          if (nextIdx > highestReached) {
            setHighestReached(nextIdx)
          }
          onSetPhase(PHASE_STEPS[nextIdx].key)
        }
      }}
    >
      {PHASE_STEPS.map((step, i) => {
        const isCurrent = step.key === currentPhase
        const isPast = currentStepIndex > i
        return (
          <div key={step.key} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight
                className="w-3 h-3 text-muted-foreground/40 mx-1"
                aria-hidden="true"
              />
            )}
            <button
              data-testid={`mission-control-phase-${i + 1}`}
              role="tab"
              aria-selected={isCurrent}
              aria-controls={`mission-control-phase-panel-${step.key}`}
              tabIndex={isCurrent ? 0 : -1}
              onClick={() => {
                if (i <= highestReached && !isLaunchOrComplete) onSetPhase(step.key)
              }}
              disabled={i > highestReached || isLaunchOrComplete}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all',
                isCurrent && 'bg-primary/10 text-primary font-medium',
                isPast && !isLaunchOrComplete && 'text-muted-foreground hover:text-foreground cursor-pointer',
                !isCurrent && !isPast && i <= highestReached && !isLaunchOrComplete && 'text-muted-foreground hover:text-foreground cursor-pointer',
                !isCurrent && !isPast && i > highestReached && 'text-muted-foreground/50 cursor-default'
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors',
                  isCurrent && 'bg-primary text-primary-foreground',
                  isPast && 'bg-green-500/20 text-green-400',
                  !isCurrent && !isPast && 'bg-muted text-muted-foreground/50'
                )}
              >
                {isPast ? '✓' : i + 1}
              </span>
              {step.label}
            </button>
          </div>
        )
      })}
    </nav>
  )
}
