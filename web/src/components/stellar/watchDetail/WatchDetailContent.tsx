import type { StellarNotification, StellarWatch } from '../../../types/stellar'
import type { PendingAction } from '../EventCard'
import type { WatchAttemptSummary } from '../lib/derive'
import { Section, SectionHeader, Stat, Recommendation } from './WatchDetailPrimitives'
import {
  EVENT_TIMELINE_LIMIT,
  FREQUENCY_WINDOW_HOURS,
  WATCH_TIMELINE_TIMESTAMP_STYLE,
  formatRelative,
  severityColor,
} from './helpers'

interface WatchDetailContentProps {
  watch: StellarWatch
  relatedEvents: StellarNotification[]
  attemptSummary: WatchAttemptSummary | null
  totalEvents: number
  last24h: number
  criticalCount: number
  warningCount: number
  color: string
  isStale: boolean | '' | null
  isRecurring: boolean
  canRestart: boolean
  deploymentName: string
  investigatePrompt: string
  restartPrompt: string
  onAction?: (prompt: string, action?: PendingAction) => void
  onClose: () => void
}

export function WatchDetailContent({
  watch,
  relatedEvents,
  attemptSummary,
  totalEvents,
  last24h,
  criticalCount,
  warningCount,
  color,
  isStale,
  isRecurring,
  canRestart,
  deploymentName,
  investigatePrompt,
  restartPrompt,
  onAction,
  onClose,
}: WatchDetailContentProps) {
  return (
    <div className="s-scroll flex-1 overflow-y-auto px-4 py-3.5">
      {/* Why watching */}
      {watch.reason && (
        <Section title="Why we're watching">
          <span style={{ fontStyle: 'italic' }}>{watch.reason}</span>
        </Section>
      )}

      {/* Stats row */}
      <SectionHeader title="At a glance" />
      <div className="mb-3 grid grid-cols-4 gap-2">
        <Stat label="Events total" value={totalEvents.toString()} />
        <Stat label={`Last ${FREQUENCY_WINDOW_HOURS}h`} value={last24h.toString()} accent={last24h > 0 ? color : undefined} />
        <Stat label="Critical" value={criticalCount.toString()} accent={criticalCount > 0 ? 'var(--s-critical)' : undefined} />
        <Stat label="Warnings" value={warningCount.toString()} accent={warningCount > 0 ? 'var(--s-warning)' : undefined} />
      </div>

      {/* Latest observation */}
      {watch.lastUpdate && (
        <Section title="Latest observation">
          <div className="px-2.5 py-1.5" style={{
            fontSize: 12, color: 'var(--s-text-muted)',
            background: 'rgba(56,139,253,0.05)',
            borderRadius: 'var(--s-rs)',
            lineHeight: 1.5,
          }}>
            {watch.lastUpdate}
          </div>
          {watch.lastChecked && (
            <div style={{ fontSize: 10, color: 'var(--s-text-dim)', marginTop: 4, fontFamily: 'var(--s-mono)' }}>
              checked {formatRelative(watch.lastChecked)}{isStale && ' · ⚠ stale'}
            </div>
          )}
        </Section>
      )}

      {/* Recommendations */}
      <SectionHeader title="Recommendations" />
      {onAction && (
        <>
          <Recommendation
            label="Pull logs & investigate"
            rationale="Read the most recent log lines, surface stack traces, correlate with recent deploys before any change."
            confidence={95}
            color="var(--s-info)"
            onExecute={() => { onAction(investigatePrompt); onClose() }}
          />
          {canRestart && (
            <Recommendation
              label="Restart the deployment"
              rationale={`A rollout restart cycles every pod through a fresh image pull and a clean process — clears most transient crash loops${isRecurring ? '; recurring failure pattern suggests this fix may be temporary' : ''}.`}
              confidence={isRecurring ? 65 : 85}
              color="var(--s-warning)"
              onExecute={() => {
                onAction(restartPrompt, {
                  prompt: restartPrompt,
                  actionType: 'RestartDeployment',
                  cluster: watch.cluster,
                  namespace: watch.namespace,
                  name: deploymentName,
                })
                onClose()
              }}
            />
          )}
        </>
      )}

      {/* Stellar's actions — attempt history for this workload */}
      <SectionHeader title="Stellar's actions" />
      <div className="mb-3">
        {!attemptSummary || attemptSummary.recent.length === 0 ? (
          <div className="px-2.5 py-1" style={{ fontSize: 11, color: 'var(--s-text-dim)', fontStyle: 'italic' }}>
            No attempts in last 24 hours.
          </div>
        ) : (
          <>
            <div className="mb-1 px-2.5 py-1" style={{
              fontSize: 11, color: 'var(--s-text-muted)', fontFamily: 'var(--s-mono)',
            }}>
              {attemptSummary.total} attempt{attemptSummary.total === 1 ? '' : 's'} ·
              {' '}{attemptSummary.resolved}✓ resolved ·
              {' '}{attemptSummary.escalated}⚠ escalated ·
              {' '}{attemptSummary.paused}⏸ paused
            </div>
            {attemptSummary.recent.map(s => {
              const statusColor =
                s.status === 'resolved' ? 'var(--s-success)' :
                s.status === 'escalated' ? 'var(--s-warning)' :
                s.status === 'exhausted' ? 'var(--s-warning)' :
                'var(--s-info)'
              const icon =
                s.status === 'resolved' ? '✓' :
                s.status === 'escalated' ? '⚠' :
                s.status === 'exhausted' ? '⏸' : '…'
              return (
                <div key={s.id} className="mb-1 flex items-center gap-2 px-2.5 py-1.5" style={{
                  fontSize: 11,
                  borderLeft: `2px solid ${statusColor}`,
                  background: 'var(--s-surface-2)', borderRadius: 'var(--s-rs)',
                }}>
                  <span style={WATCH_TIMELINE_TIMESTAMP_STYLE}>
                    {formatRelative(s.startedAt)}
                  </span>
                  <span style={{ color: statusColor, fontWeight: 600 }}>{icon}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.summary || s.status}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--s-text-dim)' }}>
                    {s.actionsTaken} act
                  </span>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Event timeline */}
      {relatedEvents.length > 0 && (
        <>
          <SectionHeader title={`Event timeline (${relatedEvents.length})`} />
          <div className="mb-3">
            {relatedEvents.slice(0, EVENT_TIMELINE_LIMIT).map(ev => (
              <div key={ev.id} className="mb-1 flex items-center gap-2 px-2.5 py-1.5" style={{
                fontSize: 11,
                borderLeft: `2px solid ${severityColor(ev.severity)}`,
                background: 'var(--s-surface-2)', borderRadius: 'var(--s-rs)',
              }}>
                <span style={WATCH_TIMELINE_TIMESTAMP_STYLE}>
                  {formatRelative(ev.createdAt)}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </span>
              </div>
            ))}
            {relatedEvents.length > EVENT_TIMELINE_LIMIT && (
              <div style={{ fontSize: 10, color: 'var(--s-text-dim)', textAlign: 'center', marginTop: 4 }}>
                +{relatedEvents.length - EVENT_TIMELINE_LIMIT} earlier
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
