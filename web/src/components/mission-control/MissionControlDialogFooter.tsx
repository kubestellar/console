/**
 * MissionControlDialogFooter — Bottom navigation bar with Back/Next/Launch
 * buttons and phase summary info. Rendered only during phases 1-3 (not during
 * launch, complete, or review-mode).
 */

import {
  Rocket,
  ChevronRight,
  ChevronLeft,
  FlaskConical,
  Monitor,
  GitPullRequestArrow,
  Loader2,
} from 'lucide-react'
import { Button } from '../ui/Button'
import type { MissionControlState } from './types'

interface MissionControlDialogFooterProps {
  state: MissionControlState
  canGoBack: boolean
  canAdvance: boolean
  isSubmittingLaunch: boolean
  onBack: () => void
  onNext: () => void
  onLaunch: (dryRun: boolean) => void
  onRequestApproval: () => void
  onDeployLocal: () => void
}

export function MissionControlDialogFooter({
  state,
  canGoBack,
  canAdvance,
  isSubmittingLaunch,
  onBack,
  onNext,
  onLaunch,
  onRequestApproval,
  onDeployLocal,
}: MissionControlDialogFooterProps) {
  return (
    <footer className="flex items-center justify-between px-6 py-3 border-t border-border bg-card rounded-b-xl">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {state.projects.length > 0 && (
          <span>
            {state.projects.length} project
            {state.projects.length !== 1 ? 's' : ''} selected
          </span>
        )}
        {state.assignments.length > 0 && (
          <span>
            → {state.assignments.filter((a) => (a.projectNames ?? []).length > 0).length} cluster
            {state.assignments.filter((a) => (a.projectNames ?? []).length > 0).length !== 1 ? 's' : ''}
          </span>
        )}
        {/* Legend (only on blueprint phase) */}
        {state.phase === 'blueprint' && (
          <>
            <span className="w-px h-4 bg-border" />
            <span className="flex items-center gap-1.5 text-2xs">
              <span className="w-4 h-0 border-t border-amber-500 inline-block" />
              Cross-cluster
            </span>
            <span className="flex items-center gap-1.5 text-2xs">
              <span className="w-4 h-0 border-t border-dashed border-indigo-500 inline-block" />
              Intra-cluster
            </span>
            <span className="flex items-center gap-1.5 text-2xs">
              <span className="w-3 h-3 rounded-full border-2 border-green-500 inline-block" />
              Installed
            </span>
            <span className="flex items-center gap-1.5 text-2xs">
              <span className="w-3 h-3 rounded-full border border-dashed border-slate-500 inline-block" />
              Needs deploy
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {canGoBack && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onBack}
            icon={<ChevronLeft className="w-3.5 h-3.5" />}
          >
            Back
          </Button>
        )}
        {state.phase === 'blueprint' ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onRequestApproval}
              icon={<GitPullRequestArrow className="w-3.5 h-3.5" />}
              title="Create a GitHub issue with the deployment plan for team approval"
            >
              Request Approval
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onDeployLocal}
              icon={<Monitor className="w-3.5 h-3.5" />}
              title="Create local clusters to simulate the deployment"
            >
              Deploy Local
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-testid="mission-control-launch"
              onClick={() => onLaunch(false)}
              disabled={isSubmittingLaunch}
              className="bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-purple-500/25"
              icon={isSubmittingLaunch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            >
              {isSubmittingLaunch ? 'Starting…' : 'Deploy to Clusters'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onLaunch(true)}
              disabled={isSubmittingLaunch}
              icon={isSubmittingLaunch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
              title="Run against live clusters without deploying — report only"
            >
              {isSubmittingLaunch ? 'Starting…' : 'Dry Run'}
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={onNext}
            disabled={!canAdvance}
          >
            Next
            <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        )}
      </div>
    </footer>
  )
}
