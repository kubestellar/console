import type { StellarNotification } from '../../types/stellar'
import { countRelated, deriveImportance, deriveShortReason, deriveTags, importanceColor, type SolveStatus } from './lib/derive'

export interface PendingAction {
  prompt: string
  actionType: string
  cluster: string
  namespace: string
  name: string
}

const REVERSIBLE_ACTION_TYPES = ['ScaleDeployment', 'RestartDeployment']

const HINT_TO_ACTION_TYPE: Record<string, string> = {
  restart: 'RestartDeployment',
  scale: 'ScaleDeployment',
  investigate: 'investigate',
  solve: 'solve',
}

function extractResourceName(notification: StellarNotification): string {
  if (notification.dedupeKey) {
    const parts = notification.dedupeKey.split(':')
    const offset = parts[0] === 'ev' ? 1 : 0
    if (parts.length >= offset + 3) {
      return parts[offset + 2]
    }
  }
  return ''
}

function isCompletedReversibleAction(notification: StellarNotification): boolean {
  if (notification.type !== 'action') return false
  if (!notification.title.startsWith('Action completed')) return false
  return REVERSIBLE_ACTION_TYPES.some(t => notification.title.includes(t) || notification.body.includes(t))
}

function buildRollbackPrompt(notification: StellarNotification): string {
  for (const actionType of REVERSIBLE_ACTION_TYPES) {
    if (notification.title.includes(actionType) || notification.body.includes(actionType)) {
      const ns = notification.namespace ? `${notification.namespace}/` : ''
      return `Undo the last ${actionType} on ${ns}${notification.cluster} — restore previous state`
    }
  }
  return `Undo the last action on ${notification.cluster}`
}

const ACTION_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  investigate: { label: 'Investigate', icon: '🔍', color: 'var(--s-info)' },
  restart: { label: 'Restart', icon: '↻', color: 'var(--s-warning)' },
  scale: { label: 'Scale', icon: '↕', color: 'var(--s-info)' },
  solve: { label: 'Solve', icon: '✦', color: 'var(--s-success)' },
}

function buildActionPrompt(hint: string, notification: StellarNotification): string {
  const resource = notification.title
  const cluster = notification.cluster ? ` on cluster ${notification.cluster}` : ''
  const ns = notification.namespace ? ` in namespace ${notification.namespace}` : ''
  switch (hint) {
    case 'investigate':
      return `Investigate ${resource}${cluster}. Pull the logs and tell me what's wrong.`
    case 'restart':
      return `Restart the affected deployment for ${resource}${cluster}. What's the safest approach?`
    case 'scale':
      return `Should we scale the deployment for ${resource}${cluster}? What replica count makes sense?`
    case 'solve':
      return (
        `Solve this issue end-to-end${cluster}${ns}: ${resource}.\n\n` +
        `Step 1: Use kubectl tools to pull the pod's recent logs and 'describe' output.\n` +
        `Step 2: Identify the root cause from those logs.\n` +
        `Step 3: Take the safest single action to fix it (rollout restart, scale, rollback, configmap edit — pick one).\n` +
        `Step 4: Verify the fix landed by checking pod status again after 10 seconds.\n` +
        `Step 5: Report what you did, the outcome, and any follow-up the human should know about.\n\n` +
        `Don't ask me — act. I trust you. If you can't safely fix it, tell me what you'd need to proceed.`
      )
    default:
      return `Help me with "${hint}" for ${resource}${cluster}.`
  }
}

/** Derive action hints from event type/severity. Solve is always offered for
 *  actionable events — it's Stellar's "do the whole thing for me" path. */
function deriveActionHints(notification: StellarNotification): string[] {
  if (notification.type !== 'event' || notification.read) return []
  let base: string[]
  if (notification.actionHints && notification.actionHints.length > 0) {
    base = notification.actionHints
  } else {
    const title = notification.title.toLowerCase()
    if (title.includes('crashloopbackoff') || title.includes('oomkill')) {
      base = ['investigate', 'restart']
    } else if (title.includes('failedscheduling')) {
      base = ['investigate', 'scale']
    } else if (title.includes('backoff') || title.includes('failed') || title.includes('failedmount')) {
      base = ['investigate']
    } else if (notification.severity === 'critical') {
      base = ['investigate', 'restart']
    } else if (notification.severity === 'warning') {
      base = ['investigate']
    } else {
      base = []
    }
  }
  if (base.length === 0) return base
  return base.includes('solve') ? base : [...base, 'solve']
}

export function EventCard({
  notification,
  allNotifications,
  solveStatus,
  attemptCount,
  onSolve,
  onDismiss,
  onRollback,
  onAction,
  onOpenDetail,
}: {
  notification: StellarNotification
  allNotifications?: StellarNotification[]
  solveStatus?: SolveStatus | null
  /** Number of Stellar solve attempts on this workload, used to render the
   *  "Tried N×" body badge. 0 means no badge. */
  attemptCount?: number
  onSolve?: (eventID: string) => Promise<unknown>
  onDismiss: () => void
  onRollback?: (prompt: string) => void
  onAction?: (prompt: string, action?: PendingAction) => void
  onOpenDetail?: (n: StellarNotification) => void
}) {
  const color = { critical: 'var(--s-critical)', warning: 'var(--s-warning)', info: 'var(--s-info)' }[notification.severity] ?? 'var(--s-text-muted)'
  const showRollback = isCompletedReversibleAction(notification)
  const hints = deriveActionHints(notification)
  const relatedCount = allNotifications ? countRelated(notification, allNotifications) : 0
  const tags = deriveTags(notification, relatedCount)
  const importance = deriveImportance(notification, relatedCount)
  const importanceCol = importanceColor(importance.label)
  const shortReason = deriveShortReason(notification)

  return (
    <div
      onClick={() => onOpenDetail?.(notification)}
      style={{
        borderLeft: `3px solid ${color}`,
        background: notification.read ? 'transparent' : 'var(--s-surface-2)',
        border: notification.read ? '1px solid transparent' : '1px solid var(--s-border)',
        borderLeftColor: color,
        borderRadius: 'var(--s-r)',
        padding: '8px 10px',
        opacity: notification.read ? 0.45 : 1,
        cursor: onOpenDetail ? 'pointer' : 'default',
        transition: 'background 0.1s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--s-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {notification.title}
        </div>
        {!notification.read && (
          <span title={`importance score: ${importance.score}`} style={{
            fontSize: 9, fontFamily: 'var(--s-mono)', fontWeight: 700,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            color: importanceCol, border: `1px solid ${importanceCol}`,
            borderRadius: 8, padding: '0 5px', flexShrink: 0,
          }}>{importance.label}</span>
        )}
        {onOpenDetail && (
          <span style={{ fontSize: 10, color: 'var(--s-text-dim)', fontFamily: 'var(--s-mono)', flexShrink: 0 }}>details →</span>
        )}
      </div>
      {tags.length > 0 && !notification.read && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {tags.map(t => (
            <span key={t} style={{
              fontSize: 9, fontFamily: 'var(--s-mono)',
              padding: '1px 5px', borderRadius: 6,
              background: 'var(--s-surface)', color: 'var(--s-text-muted)',
              border: '1px solid var(--s-border-muted)',
            }}>{t}</span>
          ))}
        </div>
      )}
      {shortReason && !notification.read && (
        <div style={{
          fontSize: 11, color: color, lineHeight: 1.5, marginTop: 4,
          fontStyle: 'italic', opacity: 0.85,
        }}>
          ✦ {shortReason}
        </div>
      )}
      {solveStatus && (
        <div style={{ marginTop: 6 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3,
          }}>
            <span style={{
              fontSize: 11, fontFamily: 'var(--s-mono)', fontWeight: 600,
              color: solveStatus.color, flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {solveStatus.label}
            </span>
            <span style={{
              fontSize: 10, fontFamily: 'var(--s-mono)',
              color: solveStatus.color, flexShrink: 0,
            }}>
              {solveStatus.percent}%
            </span>
          </div>
          <div style={{
            height: 3, background: 'var(--s-border-muted)',
            borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, solveStatus.percent))}%`,
              background: solveStatus.color,
              transition: 'width 0.35s ease',
            }} />
          </div>
        </div>
      )}
      {attemptCount && attemptCount > 0 ? (
        <div style={{
          marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)',
          padding: '1px 6px', borderRadius: 10,
          background: 'var(--s-surface)', border: '1px solid var(--s-border-muted)',
        }}>
          <span>✦ Stellar tried {attemptCount}× — see details</span>
        </div>
      ) : null}
      <div style={{ fontSize: 12, color: 'var(--s-text-muted)', lineHeight: 1.55, marginTop: 4 }}>{notification.body}</div>
      {!notification.read && (() => {
        // When Stellar is autonomously solving (or already finished resolving
        // successfully), hide manual action buttons — the user shouldn't have to
        // click anything in those cases. EXCEPTION: when Stellar escalated or
        // exhausted, the operator needs an obvious next step. We surface a
        // single "Try AI mission" button there so they can hand it off without
        // hunting through the mission sidebar.
        const isAutoActive = solveStatus?.isActive ?? false
        const isResolved = solveStatus?.phase === 'resolved'
        const isEscalated = solveStatus?.phase === 'escalated' || solveStatus?.phase === 'exhausted'
        const hideManualActions = isAutoActive || isResolved
        return (
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <button onClick={onDismiss} style={{ background: 'none', border: '1px solid var(--s-border-muted)', borderRadius: 'var(--s-rs)', padding: '2px 8px', fontSize: 11, color: 'var(--s-text-muted)', cursor: 'pointer' }}>Dismiss</button>
          {showRollback && onRollback && (
            <button
              onClick={() => onRollback(buildRollbackPrompt(notification))}
              style={{ background: 'none', border: '1px solid var(--s-border-muted)', borderRadius: 'var(--s-rs)', padding: '2px 8px', fontSize: 11, color: 'var(--s-text-muted)', cursor: 'pointer' }}
            >
              ↩ Undo this
            </button>
          )}
          {isEscalated && onSolve && (
            <button
              onClick={() => { void onSolve(notification.id) }}
              title="Escalate to an AI mission on your connected agent"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(227,179,65,0.1)',
                border: '1px solid var(--s-warning)',
                borderRadius: 'var(--s-rs)',
                padding: '2px 10px',
                fontSize: 11, color: 'var(--s-warning)', cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              <span>✦</span><span>Try AI mission</span>
            </button>
          )}
          {!hideManualActions && !isEscalated && hints.map(hint => {
            const cfg = ACTION_CONFIG[hint] ?? { label: hint.charAt(0).toUpperCase() + hint.slice(1), icon: '→', color: 'var(--s-text-muted)' }
            const isSolveActive = hint === 'solve' && solveStatus?.isActive
            return (
              <button
                key={hint}
                disabled={isSolveActive}
                onClick={() => {
                  // The Solve button on Stellar v2 fires a headless solve loop
                  // server-side instead of pre-filling the chat. JARVIS doesn't
                  // ask you to draft the prompt — it just gets to work.
                  if (hint === 'solve' && onSolve) {
                    void onSolve(notification.id)
                    return
                  }
                  const prompt = buildActionPrompt(hint, notification)
                  const action: PendingAction = {
                    prompt,
                    actionType: HINT_TO_ACTION_TYPE[hint] ?? hint,
                    cluster: notification.cluster || '',
                    namespace: notification.namespace || '',
                    name: extractResourceName(notification),
                  }
                  onAction?.(prompt, action)
                }}
                title={isSolveActive ? 'Solve already in progress' : `${cfg.label}: ${notification.title}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  background: 'none',
                  border: `1px solid ${cfg.color}`,
                  borderRadius: 'var(--s-rs)',
                  padding: '2px 8px',
                  fontSize: 11,
                  color: cfg.color,
                  cursor: isSolveActive ? 'not-allowed' : 'pointer',
                  opacity: isSolveActive ? 0.5 : 1,
                }}
              >
                <span>{cfg.icon}</span>
                <span>{isSolveActive ? 'Solving…' : cfg.label}</span>
              </button>
            )
          })}
          {hideManualActions && isAutoActive && (
            <span style={{
              fontSize: 10, fontFamily: 'var(--s-mono)', color: 'var(--s-text-dim)',
              fontStyle: 'italic', alignSelf: 'center',
            }}>
              Stellar is handling this — no input needed.
            </span>
          )}
        </div>
        )
      })()}
    </div>
  )
}
