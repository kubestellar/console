/**
 * LaunchSequence — Deploy execution panel.
 *
 * Loads KB mission JSON per workload, merges the deployment plan into
 * one unified mission prompt, and tracks progress for the single session.
 *
 * The hook/state logic lives in useLaunchSequence.ts, pure helpers live in
 * LaunchSequence.utils.ts, and the live-activity / phase-checklist rendering
 * lives in MissionExecutionPanel.tsx / LaunchSequencePhaseCard.tsx so this
 * file stays focused on composition.
 */

import { motion } from 'framer-motion'
import { Rocket, AlertTriangle, RotateCcw, PartyPopper } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { MissionExecutionPanel } from './MissionExecutionPanel'
import { LaunchSequencePhaseCard } from './LaunchSequencePhaseCard'
import { useLaunchSequence } from './useLaunchSequence'
import type { LaunchSequenceProps } from './LaunchSequence.types'

export function LaunchSequence({
  state,
  onUpdateProgress,
  onComplete,
  onClose,
  onRollback }: LaunchSequenceProps) {
  const { t } = useTranslation('common')
  const {
    effectivePhases,
    hasNothingToDeploy,
    progress,
    launchMission,
    deploymentProjectCount,
    allComplete,
    allSuccess,
    startUnifiedMission,
  } = useLaunchSequence({ state, onUpdateProgress, onComplete })

  // #6408 — If the wizard landed on Launch with no phases AND no assignments,
  // show an explicit error instead of auto-firing onComplete().
  if (hasNothingToDeploy) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="text-center">
          <div className="inline-flex p-3 rounded-2xl bg-amber-500/20 mb-3">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold">{t('missionControl.launchSequence.noProjectsTitle')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('missionControl.launchSequence.noProjectsDescription')}
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <Button variant="secondary" size="sm" onClick={() => onClose ? onClose() : onComplete()}>
            {t('actions.close')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="inline-flex p-3 rounded-2xl bg-linear-to-br from-purple-500/20 to-indigo-500/20 mb-3"
        >
          {allComplete ? (
            allSuccess ? (
              <PartyPopper className="w-8 h-8 text-green-400" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            )
          ) : (
            <Rocket className="w-8 h-8 text-purple-400" />
          )}
        </motion.div>
        <h2 className="text-2xl font-bold">
          {allComplete
            ? allSuccess
              ? t(state.isDryRun ? 'missionControl.launchSequence.dryRunCompleteTitle' : 'missionControl.launchSequence.missionCompleteTitle')
              : t(state.isDryRun ? 'missionControl.launchSequence.dryRunIssuesTitle' : 'missionControl.launchSequence.missionIssuesTitle')
            : t(state.isDryRun ? 'missionControl.launchSequence.dryRunInProgressTitle' : 'missionControl.launchSequence.launchInProgressTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {allComplete
            ? t('missionControl.launchSequence.allPhasesFinished')
            : effectivePhases.length === 1
              ? t(deploymentProjectCount === 1 ? 'missionControl.launchSequence.deployingProjects_one' : 'missionControl.launchSequence.deployingProjects_other', { count: deploymentProjectCount, phaseCount: effectivePhases.length })
              : t(deploymentProjectCount === 1 ? 'missionControl.launchSequence.deployingProjectsPlural_one' : 'missionControl.launchSequence.deployingProjectsPlural_other', { count: deploymentProjectCount, phaseCount: effectivePhases.length })}
        </p>
      </div>

      <MissionExecutionPanel mission={launchMission} />

      {/* Phase checklist */}
      <div className="space-y-4">
        {progress.map((phase) => {
          const phaseDef = effectivePhases.find((p) => p.phase === phase.phase)
          return (
            <LaunchSequencePhaseCard
              key={phase.phase}
              phase={phase}
              phaseDef={phaseDef}
              projects={state.projects}
              onRetry={() => {
                void startUnifiedMission()
              }}
            />
          )
        })}
      </div>

      {/* Completion actions */}
      {allComplete && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center gap-3 pt-4"
        >
          {!allSuccess && onRollback && (
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw className="w-3 h-3" />}
              onClick={onRollback}
              data-testid="mission-control-rollback"
            >
              Rollback Changes
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onClose ? onClose() : onComplete()}>
            {!allSuccess ? 'Close Mission' : 'Close'}
          </Button>
        </motion.div>
      )}
    </div>
  )
}
