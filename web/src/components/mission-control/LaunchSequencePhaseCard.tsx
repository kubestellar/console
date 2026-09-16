/**
 * LaunchSequencePhaseCard — Single phase checklist card extracted from
 * LaunchSequence.tsx so the main component file stays under 400 lines.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import type { DeployPhase, MissionControlState, PhaseProgress } from './types'
import { STATUS_ICONS } from './LaunchSequence.constants'

interface LaunchSequencePhaseCardProps {
  phase: PhaseProgress
  phaseDef: DeployPhase | undefined
  projects: MissionControlState['projects']
  onRetry: () => void
}

export function LaunchSequencePhaseCard({ phase, phaseDef, projects, onRetry }: LaunchSequencePhaseCardProps) {
  const { t } = useTranslation('common')

  return (
    <motion.div
      key={phase.phase}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (phase.phase - 1) * 0.15 }}
      className={cn(
        'rounded-xl border p-4',
        phase.status === 'running' && 'border-amber-500/30 bg-amber-500/5',
        phase.status === 'completed' && 'border-green-500/30 bg-green-500/5',
        phase.status === 'failed' && 'border-red-500/30 bg-red-500/5',
        phase.status === 'pending' && 'border-border bg-card',
        phase.status === 'skipped' && 'border-border bg-card opacity-50'
      )}
    >
      <div className="flex items-center gap-3 mb-2">
        {STATUS_ICONS[phase.status]}
        <div className="flex-1">
          <h3 className="text-sm font-medium">
            Phase {phase.phase}: {phaseDef?.name ?? `Phase ${phase.phase}`}
          </h3>
        </div>
        {phase.status === 'failed' && (
          <Button
            variant="secondary"
            size="sm"
            data-testid="mission-control-retry"
            className="h-6 text-xs"
            icon={<RotateCcw className="w-3 h-3" />}
            onClick={onRetry}
          >
            {t('missionControl.launchSequence.retryFailed')}
          </Button>
        )}
      </div>

      <div className="space-y-1 ml-7">
        <AnimatePresence>
          {phase.projects.map((proj) => (
            <motion.div
              key={proj.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-xs"
            >
              <span className="shrink-0">{STATUS_ICONS[proj.status]}</span>
              <span
                className={cn(
                  'flex-1',
                  proj.status === 'completed' && 'text-green-400',
                  proj.status === 'failed' && 'text-red-400',
                  proj.status === 'running' && 'text-amber-400',
                  proj.status === 'pending' && 'text-muted-foreground'
                )}
              >
                {projects.find((p) => p.name === proj.name)?.displayName ?? proj.name}
              </span>
              {proj.error && (
                <span className="text-[10px] text-red-400 truncate max-w-[200px]" title={proj.error}>
                  {proj.error}
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
