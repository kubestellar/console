import { useEffect, useMemo } from 'react'
import type { StellarAction, StellarNotification, StellarSolve } from '../../types/stellar'
import type { PendingAction } from './EventCard'
import { countSolveAttempts } from './lib/derive'

const RELATED_EVENT_LIMIT = 6
const RECURRING_RELATED_THRESHOLD = 2
const HINT_TO_ACTION_TYPE: Record<string, string> = {
  restart: 'RestartDeployment',
  scale: 'ScaleDeployment',
  investigate: 'investigate',
}
const HINT_CONFIDENCE: Record<string, number> = {
  restart: 88,
  scale: 72,
  investigate: 95,
}

interface EventModalProps {
  notification: StellarNotification
  allNotifications: StellarNotification[]
  pendingActions: StellarAction[]
  /** Live solve status for the modal narration. Optional so older call sites
   *  that don't yet pass it still compile; modal degrades to attempt-history
   *  narration in that case. */
  solveStatus?: import('./lib/derive').SolveStatus | null
  /** Solves list — used to surface attempt count and a row-per-attempt history
   *  in the modal so it matches the "Tried N×" badge on the card. */
  solves?: StellarSolve[]
  onClose: () => void
  onAction?: (prompt: string, action?: PendingAction) => void
}

interface DerivedNarration {
  whatHappened: string
  whyItHappened: string
  whatWereDoing: string
}

interface DerivedRecommendation {
  hint: string
  label: string
  rationale: string
  confidence: number
}

function severityColor(sev: string): string {
  if (sev === 'critical') return 'var(--s-critical)'
  if (sev === 'warning') return 'var(--s-warning)'
  return 'var(--s-info)'
}

function deriveTags(n: StellarNotification, related: StellarNotification[]): string[] {
  const tags: string[] = [n.severity]
  const t = n.title.toLowerCase()
  const hints = n.actionHints || []
  if (hints.includes('restart') || hints.includes('scale')) tags.push('auto-fixable')
  if (related.length >= RECURRING_RELATED_THRESHOLD) tags.push('recurring')
  if (t.includes('oom') || t.includes('memory')) tags.push('memory-issue')
  if (t.includes('crashloop') || t.includes('backoff')) tags.push('crash-loop')
  if (t.includes('failedscheduling')) tags.push('scheduling')
  if (t.includes('failedmount')) tags.push('storage')
  return tags
}

interface StellarAttempt {
  notification: StellarNotification
  failed: boolean
  whenIso: string
}

function deriveNarration(
  n: StellarNotification,
  related: StellarNotification[],
  pending: StellarAction[],
  completed: StellarNotification | null,
  attempts: StellarAttempt[],
  solveStatus: import('./lib/derive').SolveStatus | null,
  solveAttemptCount: number,
): DerivedNarration {
  const title = n.title.toLowerCase()

  let whatHappened = n.body || 'Stellar surfaced this event.'
  let whyItHappened = 'Cause is being investigated.'

  if (title.includes('crashloop') || title.includes('backoff')) {
    whatHappened = 'The pod is stuck in a restart loop — its container keeps starting and immediately exiting.'
    whyItHappened = related.length >= RECURRING_RELATED_THRESHOLD
      ? `Recurring failure (${related.length + 1}× observed). Likely a code or config defect introduced recently — the same crash signature keeps repeating after each restart.`
      : 'The container exits non-zero on startup. Common causes: bad config, missing secret, failing health probe, or a panic on init.'
  } else if (title.includes('oom') || title.includes('memory')) {
    whatHappened = 'The pod was killed for exceeding its memory limit.'
    whyItHappened = 'Either the workload genuinely needs more memory or there is a memory leak. Without a fix the OOM kill will repeat.'
  } else if (title.includes('failedscheduling')) {
    whatHappened = "The pod can't be placed on any node."
    whyItHappened = 'Usually insufficient cluster capacity, an unsatisfiable affinity/toleration, or PVC binding failures.'
  } else if (title.includes('failedmount')) {
    whatHappened = "The pod can't mount a required volume."
    whyItHappened = 'The referenced PVC, ConfigMap or Secret is missing, unbound, or has the wrong permissions.'
  } else if (title.includes('imagepullbackoff') || title.includes('errimagepull')) {
    whatHappened = "The kubelet can't pull the container image."
    whyItHappened = 'Image is mistyped, registry is unreachable, or the pull secret is missing/expired.'
  }

  let whatWereDoing: string
  // First-priority signal: the live solve outcome. If Stellar resolved or
  // escalated this workload, the modal narrates exactly that — beats any
  // older attempt-history phrasing or the static "Standing by" fallback.
  if (solveStatus && !solveStatus.isActive && solveStatus.phase === 'resolved') {
    whatWereDoing = 'Stellar tried a first-line fix and it worked — issue resolved. Dismiss this card when you\'re ready.'
  } else if (solveStatus && !solveStatus.isActive && solveStatus.phase === 'escalated') {
    whatWereDoing = 'Stellar tried a first-line fix and it didn\'t hold. Hand this to an AI mission — click "Try AI mission" on the card (or open the mission sidebar) to run a deeper diagnose-and-act loop on your connected agent. The mission can read logs, propose a different fix, and apply it autonomously.'
  } else if (solveStatus && !solveStatus.isActive && solveStatus.phase === 'exhausted') {
    whatWereDoing = 'Stellar tried multiple actions and hit the budget limit. Paused for your call — click "Try AI mission" to escalate to a deeper mission on your connected agent, or review what was attempted in the Stellar log and decide whether to retry.'
  } else if (solveStatus && solveStatus.isActive) {
    whatWereDoing = `Stellar is on it right now — ${solveStatus.label.replace(/^[^\sA-Za-z]+\s*/, '')}. Watch the progress bar; the activity log has step-by-step.`
  }
  // Solve-history fallback: when there's no live solveStatus but we DO have a
  // record of Stellar having attempted this workload via the autonomous loop
  // (the "Tried N×" badge on the card came from here), describe it. Without
  // this branch the modal falls through to "Standing by" while the card
  // already says "Tried 1×" — a contradiction the user called out.
  else if (solveAttemptCount > 0) {
    whatWereDoing = `Stellar has attempted this workload ${solveAttemptCount}× — see "Stellar's attempts" below. The current event came in after those attempts; pick Investigate to pull fresh logs, click Solve to retry with the AI, or use a recommended action below.`
  }
  // Prefer the most recent attempt — that's the freshest signal of what Stellar
  // has been doing. The pitch vision: report attempts like a junior engineer.
  // "Tried once, failed. Awaiting your call." beats "Standing by."
  else if (attempts.length > 0) {
    const latest = attempts[0]
    const succeededCount = attempts.filter(a => !a.failed).length
    const failedCount = attempts.length - succeededCount
    if (latest.failed) {
      whatWereDoing = `Stellar tried ${attempts.length} fix${attempts.length === 1 ? '' : 'es'} (${failedCount} failed). The issue keeps recurring — Stellar has paused and is waiting for your call before retrying. Click Solve to hand it off to the AI, or pick a manual action below.`
    } else if (pending.length > 0) {
      whatWereDoing = `Stellar restarted this ${succeededCount}× already and the issue came back. Demoted to approval mode — waiting for your sign-off before retrying.`
    } else {
      whatWereDoing = `Stellar auto-fixed this ${succeededCount}× already. Monitoring to confirm the latest fix held.`
    }
  } else if (completed) {
    whatWereDoing = `Auto-resolved by Stellar: ${completed.title}. Watching metrics to confirm the fix held.`
  } else if (pending.length > 0) {
    whatWereDoing = `Stellar prepared a fix and is awaiting your approval (${pending.length} pending action${pending.length === 1 ? '' : 's'}). Approve to execute, or click Solve for the AI to handle it end-to-end.`
  } else if ((n.actionHints || []).length > 0) {
    whatWereDoing = 'Recommendations ready below. Click Solve to hand the whole thing to the AI, or pick a manual action.'
  } else {
    whatWereDoing = 'Standing by — click Investigate to pull logs, or pick a recommended fix below.'
  }

  return { whatHappened, whyItHappened, whatWereDoing }
}

function deriveRecommendations(n: StellarNotification): DerivedRecommendation[] {
  const hints = n.actionHints || []
  return hints.map(h => {
    const confidence = HINT_CONFIDENCE[h] ?? 60
    let label = h.charAt(0).toUpperCase() + h.slice(1)
    let rationale = ''
    if (h === 'restart') {
      label = 'Restart the deployment'
      rationale = "A rollout restart cycles every pod through a fresh image pull and a clean process — clears most transient crash loops and config caches."
    } else if (h === 'scale') {
      label = 'Scale the deployment'
      rationale = 'Adding replicas spreads load and absorbs partial node failures; matched to current request volume.'
    } else if (h === 'investigate') {
      label = 'Pull logs & investigate'
      rationale = 'Read the last 100 log lines, surface the stack trace, and correlate with recent deploys before any change.'
    } else {
      rationale = `Recommended action: ${h}.`
    }
    return { hint: h, label, rationale, confidence }
  })
}

function extractResourceName(n: StellarNotification): string {
  if (!n.dedupeKey) return ''
  const parts = n.dedupeKey.split(':')
  const offset = parts[0] === 'ev' ? 1 : 0
  if (parts.length >= offset + 3) return parts[offset + 2]
  return ''
}

function buildActionPrompt(hint: string, n: StellarNotification): string {
  const resource = n.title
  const cluster = n.cluster ? ` on cluster ${n.cluster}` : ''
  if (hint === 'investigate') return `Investigate ${resource}${cluster}. Pull the logs and tell me what's wrong.`
  if (hint === 'restart') return `Restart the affected deployment for ${resource}${cluster}. What's the safest approach?`
  if (hint === 'scale') return `Should we scale the deployment for ${resource}${cluster}? What replica count makes sense?`
  return `Help me with "${hint}" for ${resource}${cluster}.`
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

export function EventModal({ notification, allNotifications, pendingActions, solveStatus, solves, onClose, onAction }: EventModalProps) {
  // Solve-derived attempt count for this workload. Mirrors the badge on the
  // card so the modal's header agrees with the list view.
  const solveAttemptCount = useMemo(
    () => countSolveAttempts(notification, solves || []),
    [notification, solves],
  )

  // Solve rows for this workload — render alongside the legacy auto-fix
  // notifications so the modal shows the same attempt history the card hints
  // at. Workload-matching mirrors countSolveAttempts.
  const workloadSolves = useMemo<StellarSolve[]>(() => {
    if (!solves || solves.length === 0) return []
    const clusterKey = (notification.cluster || '').toLowerCase()
    const nsKey = (notification.namespace || '').toLowerCase()
    return solves
      .filter(s => s.cluster.toLowerCase() === clusterKey && s.namespace.toLowerCase() === nsKey)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }, [solves, notification.cluster, notification.namespace])

  // Find related events: same dedupeKey, excluding self
  const related = useMemo(() => {
    if (!notification.dedupeKey) return []
    return allNotifications
      .filter(n => n.id !== notification.id && n.dedupeKey === notification.dedupeKey)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [allNotifications, notification.id, notification.dedupeKey])

  // Pending actions matching this resource
  const matchedPending = useMemo(() => {
    const ns = notification.namespace || ''
    const cl = notification.cluster || ''
    return pendingActions.filter(a => a.cluster === cl && (a.namespace || '') === ns)
  }, [pendingActions, notification.cluster, notification.namespace])

  // Resource fingerprint — used to find prior Stellar attempts that targeted
  // the same workload, even when the auto-fix notification has a different
  // dedupe key from the original event.
  const resourceFingerprint = useMemo(() => {
    const cluster = (notification.cluster || '').toLowerCase()
    const ns = (notification.namespace || '').toLowerCase()
    return { cluster, ns }
  }, [notification.cluster, notification.namespace])

  // Every prior Stellar attempt (auto-fixed or auto-fix failed) targeting the
  // same cluster/namespace. Sorted newest-first.
  const stellarAttempts = useMemo<StellarAttempt[]>(() => {
    return allNotifications
      .filter(n => {
        if (n.type !== 'action') return false
        const t = n.title || ''
        if (!t.startsWith('Stellar auto-fix')) return false
        if ((n.cluster || '').toLowerCase() !== resourceFingerprint.cluster) return false
        if ((n.namespace || '').toLowerCase() !== resourceFingerprint.ns) return false
        return true
      })
      .map(n => ({
        notification: n,
        failed: n.title.startsWith('Stellar auto-fix failed'),
        whenIso: n.createdAt,
      }))
      .sort((a, b) => new Date(b.whenIso).getTime() - new Date(a.whenIso).getTime())
  }, [allNotifications, resourceFingerprint.cluster, resourceFingerprint.ns])

  // Most recent completed-action notification for this resource (if any)
  const completedAction = useMemo<StellarNotification | null>(() => {
    const key = notification.dedupeKey
    if (!key) return null
    const hit = allNotifications.find(n =>
      n.type === 'action' &&
      n.title.startsWith('Action completed') &&
      n.dedupeKey === key,
    )
    return hit || null
  }, [allNotifications, notification.dedupeKey])

  const tags = deriveTags(notification, related)
  const narration = deriveNarration(notification, related, matchedPending, completedAction, stellarAttempts, solveStatus ?? null, solveAttemptCount)
  const recommendations = deriveRecommendations(notification)
  const color = severityColor(notification.severity)
  const resourceName = extractResourceName(notification)

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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
                {notification.severity} · {notification.type} · {formatRelative(notification.createdAt)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{notification.title}</div>
              {(notification.cluster || notification.namespace || resourceName) && (
                <div style={{ fontSize: 11, fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)', marginTop: 4 }}>
                  {notification.cluster}{notification.namespace ? ` / ${notification.namespace}` : ''}{resourceName ? ` / ${resourceName}` : ''}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--s-text-dim)', padding: 2 }}
              title="Close (Esc)"
            >✕</button>
          </div>
          {/* Tag row */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
            {tags.map(tag => (
              <span key={tag} style={{
                fontSize: 10, fontFamily: 'var(--s-mono)',
                padding: '2px 6px', borderRadius: 10,
                background: tag === notification.severity ? `${color}22` : 'var(--s-surface-2)',
                color: tag === notification.severity ? color : 'var(--s-text-muted)',
                border: `1px solid ${tag === notification.severity ? color : 'var(--s-border)'}`,
              }}>{tag}</span>
            ))}
            {solveAttemptCount > 0 && (
              <span style={{
                fontSize: 10, fontFamily: 'var(--s-mono)',
                padding: '2px 6px', borderRadius: 10,
                background: 'rgba(56,139,253,0.12)',
                color: 'var(--s-info)',
                border: '1px solid var(--s-info)',
              }} title="Number of times Stellar has tried to auto-solve this workload">
                ✦ Stellar tried {solveAttemptCount}×
              </span>
            )}
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="s-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          <Section title="What happened">{narration.whatHappened}</Section>
          <Section title="Why it happened">{narration.whyItHappened}</Section>
          <Section title="What we're doing">{narration.whatWereDoing}</Section>

          {workloadSolves.length > 0 && (
            <>
              <SectionHeader title={`Stellar's attempts (${workloadSolves.length})`} />
              <div style={{ marginBottom: 12 }}>
                {workloadSolves.slice(0, 5).map(s => {
                  const outcomeColor =
                    s.status === 'resolved' ? 'var(--s-success)' :
                    s.status === 'running' ? 'var(--s-info)' :
                    'var(--s-critical)'
                  const outcomeLabel =
                    s.status === 'resolved' ? '✓ resolved' :
                    s.status === 'running' ? '▶ running' :
                    s.status === 'escalated' ? '⚠ escalated' :
                    s.status === 'exhausted' ? '⏸ paused' :
                    s.status
                  return (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', fontSize: 11,
                      borderLeft: `2px solid ${outcomeColor}`,
                      background: 'var(--s-surface-2)', borderRadius: 'var(--s-rs)',
                      marginBottom: 3,
                    }}>
                      <span style={{ fontFamily: 'var(--s-mono)', color: outcomeColor, minWidth: 86 }}>
                        {outcomeLabel}
                      </span>
                      <span style={{ fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)', minWidth: 60 }}>
                        {formatRelative(s.startedAt)}
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.workload || s.namespace}
                        {s.actionsTaken > 0 && (
                          <span style={{ color: 'var(--s-text-dim)', marginLeft: 6 }}>
                            · {s.actionsTaken} action{s.actionsTaken === 1 ? '' : 's'}
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {stellarAttempts.length > 0 && workloadSolves.length === 0 && (
            <>
              <SectionHeader title={`Stellar's attempts (${stellarAttempts.length})`} />
              <div style={{ marginBottom: 12 }}>
                {stellarAttempts.slice(0, 5).map(a => (
                  <div key={a.notification.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', fontSize: 11,
                    borderLeft: `2px solid ${a.failed ? 'var(--s-critical)' : 'var(--s-success)'}`,
                    background: 'var(--s-surface-2)', borderRadius: 'var(--s-rs)',
                    marginBottom: 3,
                  }}>
                    <span style={{ fontFamily: 'var(--s-mono)', color: a.failed ? 'var(--s-critical)' : 'var(--s-success)', minWidth: 70 }}>
                      {a.failed ? '✗ failed' : '✓ ran'}
                    </span>
                    <span style={{ fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)', minWidth: 60 }}>
                      {formatRelative(a.whenIso)}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.notification.title.replace(/^Stellar auto-fix(ed)?( failed)?:\s*/i, '')}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {recommendations.length > 0 && (
            <SectionHeader title="Recommendations" />
          )}
          {recommendations.map((rec, idx) => (
            <div key={rec.hint} style={{
              border: '1px solid var(--s-border)', borderRadius: 'var(--s-r)',
              padding: '10px 12px', marginBottom: 8,
              background: idx === 0 ? 'rgba(56,139,253,0.04)' : 'transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{rec.label}</span>
                <span style={{
                  fontSize: 10, fontFamily: 'var(--s-mono)',
                  color: rec.confidence >= 80 ? 'var(--s-success)' : rec.confidence >= 60 ? 'var(--s-warning)' : 'var(--s-text-muted)',
                }}>
                  confidence: {rec.confidence}%
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--s-text-muted)', lineHeight: 1.5, marginBottom: 8 }}>
                {rec.rationale}
              </div>
              {onAction && (
                <button
                  onClick={() => {
                    const prompt = buildActionPrompt(rec.hint, notification)
                    const action: PendingAction = {
                      prompt,
                      actionType: HINT_TO_ACTION_TYPE[rec.hint] ?? rec.hint,
                      cluster: notification.cluster || '',
                      namespace: notification.namespace || '',
                      name: resourceName,
                    }
                    onAction(prompt, action)
                    onClose()
                  }}
                  style={{
                    background: 'none', border: `1px solid ${color}`, color,
                    borderRadius: 'var(--s-rs)', padding: '4px 12px',
                    fontSize: 11, cursor: 'pointer',
                  }}
                >
                  Execute via chat →
                </button>
              )}
            </div>
          ))}

          {related.length > 0 && (
            <>
              <SectionHeader title={`Related events (${related.length})`} />
              <div style={{ marginBottom: 12 }}>
                {related.slice(0, RELATED_EVENT_LIMIT).map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px', fontSize: 11,
                    borderLeft: `2px solid ${severityColor(r.severity)}`,
                    background: 'var(--s-surface-2)', borderRadius: 'var(--s-rs)',
                    marginBottom: 3,
                  }}>
                    <span style={{ fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)', minWidth: 70 }}>
                      {formatRelative(r.createdAt)}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </span>
                  </div>
                ))}
                {related.length > RELATED_EVENT_LIMIT && (
                  <div style={{ fontSize: 10, color: 'var(--s-text-dim)', textAlign: 'center', marginTop: 4 }}>
                    +{related.length - RELATED_EVENT_LIMIT} earlier
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
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
