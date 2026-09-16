/**
 * MissionExecutionPanel — Live mission activity panel extracted from
 * LaunchSequence.tsx so the main component file stays under 400 lines.
 */

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { Mission } from '../../hooks/useMissions'
import {
  getMissionStepLabel,
  getRecentActivityMessages,
  LIVE_ACTIVITY_PROGRESS_MAX,
  LIVE_ACTIVITY_PROGRESS_MIN,
} from './LaunchSequence.utils'

export function MissionExecutionPanel({ mission }: { mission: Mission | null }) {
  const { t } = useTranslation('common')
  const logEndRef = useRef<HTMLDivElement | null>(null)
  const progressValue = typeof mission?.progress === 'number'
    ? Math.max(LIVE_ACTIVITY_PROGRESS_MIN, Math.min(LIVE_ACTIVITY_PROGRESS_MAX, Math.round(mission.progress)))
    : null
  const recentMessages = mission ? getRecentActivityMessages(mission) : []

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [mission?.updatedAt, recentMessages.length])

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4" data-testid="mission-control-live-activity">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
            {t('missionControl.launchSequence.liveActivityTitle', { defaultValue: 'Live mission activity' })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {mission
              ? t('missionControl.launchSequence.liveActivityDescription', { defaultValue: 'Follow the unified AI deployment session without leaving this modal.' })
              : t('missionControl.launchSequence.preparingMission', { defaultValue: 'Preparing the unified deployment session and runbooks…' })}
          </p>
        </div>
        {mission && (
          <span
            className={cn(
              'rounded-full border px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide',
              mission.status === 'running' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
              mission.status === 'waiting_input' && 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
              mission.status === 'completed' && 'border-green-500/30 bg-green-500/10 text-green-300',
              mission.status === 'failed' && 'border-red-500/30 bg-red-500/10 text-red-300',
              mission.status === 'blocked' && 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
              mission.status !== 'running' &&
                mission.status !== 'waiting_input' &&
                mission.status !== 'completed' &&
                mission.status !== 'failed' &&
                mission.status !== 'blocked' &&
                'border-border bg-card text-foreground'
            )}
          >
            {mission.status.replace('_', ' ')}
          </span>
        )}
      </div>

      {mission ? (
        <>
          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="rounded-lg border border-border/70 bg-background/70 p-3">
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                {t('missionControl.launchSequence.currentStepLabel', { defaultValue: 'Current step' })}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground" data-testid="mission-control-live-step">
                {getMissionStepLabel(mission)}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 p-3">
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                {t('missionControl.launchSequence.agentActivityLabel', { defaultValue: 'Agent activity' })}
              </p>
              <p className="mt-1 text-sm text-foreground">
                {mission.tokenUsage && mission.tokenUsage.total > 0
                  ? t('missionControl.launchSequence.tokenUsageValue', {
                      defaultValue: '{{total}} tokens used',
                      total: mission.tokenUsage.total.toLocaleString(),
                    })
                  : t('missionControl.launchSequence.waitingForTokens', { defaultValue: 'Streaming updates…' })}
              </p>
            </div>
          </div>

          {progressValue !== null && (
            <div className="space-y-2" data-testid="mission-control-live-progress">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {t('missionControl.launchSequence.progressLabel', { defaultValue: 'Mission progress' })}
                </span>
                <span className="font-medium text-foreground">
                  {t('missionControl.launchSequence.progressValue', { defaultValue: '{{progress}}%', progress: progressValue })}
                </span>
              </div>
              <div className="h-2 rounded-full bg-background/80">
                <div
                  className="h-full rounded-full bg-linear-to-r from-purple-500 to-indigo-500 transition-[width] duration-300"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border/70 bg-background/70">
            <div className="border-b border-border/70 px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('missionControl.launchSequence.activityLogLabel', { defaultValue: 'Streaming activity log' })}
            </div>
            <div className="max-h-64 overflow-y-auto px-3 py-2 space-y-2" data-testid="mission-control-live-log">
              {recentMessages.length > 0 ? recentMessages.map((message) => (
                <div key={message.id} className="rounded-md border border-border/60 bg-card/70 px-3 py-2 text-xs">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      message.role === 'assistant' && 'bg-primary/15 text-primary',
                      message.role === 'system' && 'bg-amber-500/15 text-amber-300'
                    )}>
                      {message.role === 'assistant'
                        ? t('missionControl.launchSequence.assistantRole', { defaultValue: 'Agent' })
                        : t('missionControl.launchSequence.systemRole', { defaultValue: 'System' })}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-muted-foreground">
                    {message.content}
                  </div>
                </div>
              )) : (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  {t('missionControl.launchSequence.waitingForLogs', { defaultValue: 'Waiting for the agent to stream execution details…' })}
                </p>
              )}
              <div ref={logEndRef} aria-hidden="true" />
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border/70 bg-background/50 px-4 py-5 text-sm text-muted-foreground">
          {t('missionControl.launchSequence.preparingMissionDetails', { defaultValue: 'Mission Control is composing the deployment prompt and will stream agent progress here as soon as execution starts.' })}
        </div>
      )}
    </div>
  )
}
