import { useEffect, useMemo } from 'react'
import type { StellarNotification, StellarSolve, StellarWatch } from '../../types/stellar'
import type { PendingAction } from './EventCard'
import { getWatchAttemptSummary } from './lib/derive'

const EVENT_TIMELINE_LIMIT = 10
const STALE_THRESHOLD_MS = 10 * 60 * 1000
const RECURRING_EVENT_THRESHOLD = 3
const FREQUENCY_WINDOW_HOURS = 24

interface WatchDetailModalProps {
  watch: StellarWatch
  allNotifications: StellarNotification[]
  solves?: StellarSolve[]
  onClose: () => void
  onResolve: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, minutes: number) => void
  onAction?: (prompt: string, action?: PendingAction) => void
}

function severityColor(sev: string): string {
  if (sev === 'critical') return 'var(--s-critical)'
  if (sev === 'warning') return 'var(--s-warning)'
  return 'var(--s-info)'
}

function deploymentNameFromPodName(podName: string): string {
  const parts = podName.split('-')
  if (parts.length < 3) return podName
  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  const looksLikeRS = /^[a-z0-9]{5,10}$/.test(prev)
  const looksLikePodSuffix = last.length >= 4 && last.length <= 6 && /^[a-z0-9]+$/.test(last)
  if (looksLikeRS && looksLikePodSuffix) return parts.slice(0, -2).join('-')
  return podName
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`
  if (ms < 3600_000) return `${Math.floor(ms / 60000)}m`
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`
  return `${Math.floor(ms / 86400_000)}d`
}

function matchesWatch(n: StellarNotification, watch: StellarWatch, deploymentName: string): boolean {
  if (n.cluster && n.cluster !== watch.cluster) return false
  if (n.namespace && watch.namespace && n.namespace !== watch.namespace) return false
  const t = n.title.toLowerCase()
  if (t.includes(watch.resourceName.toLowerCase())) return true
  if (deploymentName && deploymentName !== watch.resourceName && t.includes(deploymentName.toLowerCase())) return true
  // Also match via dedupeKey resource segment
  if (n.dedupeKey) {
    const parts = n.dedupeKey.split(':')
    const offset = parts[0] === 'ev' ? 1 : 0
    if (parts.length >= offset + 3) {
      const dedupeName = parts[offset + 2]
      if (dedupeName === watch.resourceName) return true
      if (deploymentName && dedupeName.startsWith(deploymentName)) return true
    }
  }
  return false
}

export function WatchDetailModal({
  watch,
  allNotifications,
  solves = [],
  onClose,
  onResolve,
  onDismiss,
  onSnooze,
  onAction,
}: WatchDetailModalProps) {
  const attemptSummary = useMemo(() => getWatchAttemptSummary(watch, solves), [watch, solves])
  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const deploymentName = watch.resourceKind === 'Pod'
    ? deploymentNameFromPodName(watch.resourceName)
    : watch.resourceName

  // Find all events that mention this resource
  const relatedEvents = useMemo(() => {
    return allNotifications
      .filter(n => matchesWatch(n, watch, deploymentName))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [allNotifications, watch, deploymentName])

  // Stats
  const totalEvents = relatedEvents.length
  const last24h = useMemo(() => {
    const cutoff = Date.now() - FREQUENCY_WINDOW_HOURS * 3600_000
    return relatedEvents.filter(n => new Date(n.createdAt).getTime() >= cutoff).length
  }, [relatedEvents])
  const criticalCount = relatedEvents.filter(n => n.severity === 'critical').length
  const warningCount = relatedEvents.filter(n => n.severity === 'warning').length

  const watchAgeMs = Date.now() - new Date(watch.createdAt).getTime()
  const isStale = watch.lastChecked && (Date.now() - new Date(watch.lastChecked).getTime() > STALE_THRESHOLD_MS)
  const isRecurring = totalEvents >= RECURRING_EVENT_THRESHOLD

  // Pick a dominant color based on highest severity of recent events
  const dominantSeverity = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'info'
  const color = severityColor(dominantSeverity)

  // Build recommendations
  const investigatePrompt =
    `Investigate ${watch.namespace}/${watch.resourceName} on cluster ${watch.cluster}. ` +
    `I've been watching this because: ${watch.reason || 'recurring issues'}. ` +
    `What's wrong and what should I do?`
  const restartPrompt =
    `Restart the deployment for ${watch.namespace}/${deploymentName} on cluster ${watch.cluster}.`

  const canRestart = watch.resourceKind === 'Pod' || watch.resourceKind === 'Deployment'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: '90vh',
          background: 'var(--s-bg, #0a0e14)',
          border: `1px solid var(--s-border)`,
          borderLeft: `4px solid ${color}`,
          borderRadius: 'var(--s-r)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--s-sans)', color: 'var(--s-text)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--s-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                Watch · {watch.resourceKind} · watching for {formatDuration(watchAgeMs)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
                {watch.namespace}/{watch.resourceName}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)', marginTop: 4 }}>
                {watch.cluster}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--s-text-dim)', padding: 2 }}
              title="Close (Esc)"
            >✕</button>
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
            <Tag label={dominantSeverity} color={color} highlighted />
            <Tag label={watch.status} color="var(--s-text-muted)" />
            {isRecurring && <Tag label="recurring" color="var(--s-warning)" />}
            {isStale && <Tag label="stale" color="var(--s-warning)" />}
            {canRestart && <Tag label="auto-fixable" color="var(--s-success)" />}
          </div>
        </div>

        {/* Body */}
        <div className="s-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          {/* Why watching */}
          {watch.reason && (
            <Section title="Why we're watching">
              <span style={{ fontStyle: 'italic' }}>{watch.reason}</span>
            </Section>
          )}

          {/* Stats row */}
          <SectionHeader title="At a glance" />
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            marginBottom: 12,
          }}>
            <Stat label="Events total" value={totalEvents.toString()} />
            <Stat label={`Last ${FREQUENCY_WINDOW_HOURS}h`} value={last24h.toString()} accent={last24h > 0 ? color : undefined} />
            <Stat label="Critical" value={criticalCount.toString()} accent={criticalCount > 0 ? 'var(--s-critical)' : undefined} />
            <Stat label="Warnings" value={warningCount.toString()} accent={warningCount > 0 ? 'var(--s-warning)' : undefined} />
          </div>

          {/* Latest observation */}
          {watch.lastUpdate && (
            <Section title="Latest observation">
              <div style={{
                fontSize: 12, color: 'var(--s-text-muted)',
                background: 'rgba(56,139,253,0.05)',
                borderRadius: 'var(--s-rs)', padding: '6px 10px',
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
          <div style={{ marginBottom: 12 }}>
            {!attemptSummary || attemptSummary.recent.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--s-text-dim)', fontStyle: 'italic', padding: '4px 10px' }}>
                No attempts in last 24 hours.
              </div>
            ) : (
              <>
                <div style={{
                  fontSize: 11, color: 'var(--s-text-muted)', fontFamily: 'var(--s-mono)',
                  padding: '4px 10px', marginBottom: 4,
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
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', fontSize: 11,
                      borderLeft: `2px solid ${statusColor}`,
                      background: 'var(--s-surface-2)', borderRadius: 'var(--s-rs)',
                      marginBottom: 3,
                    }}>
                      <span style={{ fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)', minWidth: 70 }}>
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
              <div style={{ marginBottom: 12 }}>
                {relatedEvents.slice(0, EVENT_TIMELINE_LIMIT).map(ev => (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', fontSize: 11,
                    borderLeft: `2px solid ${severityColor(ev.severity)}`,
                    background: 'var(--s-surface-2)', borderRadius: 'var(--s-rs)',
                    marginBottom: 3,
                  }}>
                    <span style={{ fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)', minWidth: 70 }}>
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

        {/* Footer — watch controls */}
        <div style={{
          padding: '10px 18px', borderTop: '1px solid var(--s-border)',
          display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0,
        }}>
          <button
            onClick={() => { onResolve(watch.id); onClose() }}
            style={footerBtn('var(--s-success)')}
          >✓ Mark resolved</button>
          <button
            onClick={() => { onSnooze(watch.id, 60); onClose() }}
            style={footerBtn('var(--s-text-muted)')}
          >⏸ Snooze 1h</button>
          <button
            onClick={() => { onDismiss(watch.id); onClose() }}
            style={footerBtn('var(--s-text-dim)')}
          >✕ Stop watching</button>
        </div>
      </div>
    </div>
  )
}

function Tag({ label, color, highlighted }: { label: string; color: string; highlighted?: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontFamily: 'var(--s-mono)',
      padding: '2px 6px', borderRadius: 10,
      background: highlighted ? `${color}22` : 'var(--s-surface-2)',
      color: highlighted ? color : 'var(--s-text-muted)',
      border: `1px solid ${highlighted ? color : 'var(--s-border)'}`,
    }}>{label}</span>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--s-surface-2)', border: '1px solid var(--s-border)',
      borderRadius: 'var(--s-rs)', padding: '6px 8px',
    }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: accent ?? 'var(--s-text)', fontFamily: 'var(--s-mono)' }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--s-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 600,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      color: 'var(--s-text-muted)', marginTop: 10, marginBottom: 6,
    }}>{title}</div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <SectionHeader title={title} />
      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--s-text)' }}>{children}</div>
    </div>
  )
}

function Recommendation({
  label, rationale, confidence, color, onExecute,
}: { label: string; rationale: string; confidence: number; color: string; onExecute: () => void }) {
  return (
    <div style={{
      border: '1px solid var(--s-border)', borderRadius: 'var(--s-r)',
      padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{
          fontSize: 10, fontFamily: 'var(--s-mono)',
          color: confidence >= 80 ? 'var(--s-success)' : confidence >= 60 ? 'var(--s-warning)' : 'var(--s-text-muted)',
        }}>
          confidence: {confidence}%
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--s-text-muted)', lineHeight: 1.5, marginBottom: 8 }}>
        {rationale}
      </div>
      <button
        onClick={onExecute}
        style={{
          background: 'none', border: `1px solid ${color}`, color,
          borderRadius: 'var(--s-rs)', padding: '4px 12px',
          fontSize: 11, cursor: 'pointer',
        }}
      >Execute via chat →</button>
    </div>
  )
}

function footerBtn(color: string): React.CSSProperties {
  return {
    background: 'none', border: `1px solid ${color}`, color,
    borderRadius: 'var(--s-rs)', padding: '4px 12px',
    fontSize: 11, cursor: 'pointer',
  }
}
