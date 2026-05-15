import type { StellarNotification, StellarSolve, StellarWatch } from '../../types/stellar'
import type { PendingAction } from './EventCard'
import { deriveWatchTrend, getWatchAttemptSummary, renderSparkline, trendColor, trendIcon } from './lib/derive'

interface Props {
  watch: StellarWatch
  allNotifications?: StellarNotification[]
  solves?: StellarSolve[]
  onResolve: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, minutes: number) => void
  onAction?: (prompt: string, action?: PendingAction) => void
  onOpenDetail?: (w: StellarWatch) => void
}

function isStale(lastChecked: string): boolean {
  return Date.now() - new Date(lastChecked).getTime() > 10 * 60 * 1000 // 10 minutes
}

function getRelativeTime(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h`
}

// Map a watched resource kind to a dispatchable action type, if any.
// We only support RestartDeployment today (per scheduler/dispatch.go).
function actionTypeForKind(kind: string): string | null {
  if (kind === 'Deployment') return 'RestartDeployment'
  // Pods auto-promote to their parent deployment in the auto-tend path,
  // so for a watched pod we still suggest RestartDeployment.
  if (kind === 'Pod') return 'RestartDeployment'
  return null
}

// Strip ReplicaSet+pod suffixes from a pod name to derive parent Deployment name.
// e.g. "api-server-7d4c5b9f4-abc12" → "api-server"
function deploymentNameFromPodName(podName: string): string {
  const parts = podName.split('-')
  if (parts.length < 3) return podName
  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  const looksLikeRS = /^[a-z0-9]{5,10}$/.test(prev)
  const looksLikePodSuffix = last.length >= 4 && last.length <= 6 && /^[a-z0-9]+$/.test(last)
  if (looksLikeRS && looksLikePodSuffix) {
    return parts.slice(0, -2).join('-')
  }
  return podName
}

export function WatchCard({ watch, allNotifications, solves, onResolve, onDismiss, onSnooze, onAction, onOpenDetail }: Props) {
  const actionType = actionTypeForKind(watch.resourceKind)
  const attemptSummary = solves ? getWatchAttemptSummary(watch, solves) : null
  const trendStats = allNotifications
    ? deriveWatchTrend(watch, allNotifications)
    : { trend: 'idle' as const, recent: 0, prior: 0, sparkline: [] }
  const showTrend = trendStats.recent > 0 || trendStats.prior > 0
  const investigatePrompt =
    `Investigate ${watch.namespace}/${watch.resourceName} on cluster ${watch.cluster}. ` +
    `I've been watching this because: ${watch.reason || 'recurring issues'}. ` +
    `What's wrong and what should I do?`

  const restartTargetName =
    watch.resourceKind === 'Pod'
      ? deploymentNameFromPodName(watch.resourceName)
      : watch.resourceName

  const restartPrompt =
    `Restart the deployment for ${watch.namespace}/${restartTargetName} on cluster ${watch.cluster}.`

  return (
    <div
      onClick={() => onOpenDetail?.(watch)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetail?.(watch)
        }
      }}
      style={{
        padding: '7px 10px',
        background: 'var(--s-surface-2)',
        border: '1px solid var(--s-border)',
        borderLeftWidth: 3,
        borderLeftColor: 'var(--s-info)',
        borderRadius: 'var(--s-r)',
        marginBottom: 4,
        cursor: onOpenDetail ? 'pointer' : 'default',
      }}
    >
      {/* Header row */}
      <div
        onClick={(e) => e.stopPropagation()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        {/* Pulse dot */}
        <div style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: 'var(--s-info)',
          boxShadow: '0 0 0 3px rgba(56,139,253,0.15)',
          animation: 's-pulse 2s ease-in-out infinite',
        }} />
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--s-text)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {watch.namespace}/{watch.resourceName}
        </span>
        <button
          onClick={() => onSnooze(watch.id, 60)}
          title="Snooze 1h"
          style={iconBtnStyle('var(--s-text-dim)')}
        >⏸</button>
        <button
          onClick={() => onResolve(watch.id)}
          title="Mark resolved"
          style={iconBtnStyle('var(--s-success)')}
        >✓</button>
        <button
          onClick={() => onDismiss(watch.id)}
          title="Dismiss"
          style={iconBtnStyle('var(--s-text-dim)')}
        >✕</button>
      </div>

      {/* Meta */}
      <div style={{
        fontSize: 10,
        color: 'var(--s-text-muted)',
        marginTop: 2,
        paddingLeft: 13,
        fontFamily: 'var(--s-mono)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}>
        <span>{watch.resourceKind} · {watch.cluster}</span>
        {showTrend && (
          <span
            title={`${trendStats.recent} events in last 24h (prior 24h: ${trendStats.prior}) · hourly distribution shown`}
            style={{
              color: trendColor(trendStats.trend),
              border: `1px solid ${trendColor(trendStats.trend)}`,
              borderRadius: 6, padding: '0 4px',
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 11 }}>{trendIcon(trendStats.trend)}</span>
            <span>{trendStats.recent}/24h</span>
            {renderSparkline(trendStats.sparkline) && (
              <span style={{ fontFamily: 'var(--s-mono)', letterSpacing: '-1px', opacity: 0.8 }}>
                {renderSparkline(trendStats.sparkline)}
              </span>
            )}
          </span>
        )}
      </div>

      {attemptSummary && (
        <div style={{
          fontSize: 10, fontFamily: 'var(--s-mono)',
          color: 'var(--s-text-muted)',
          marginTop: 3, paddingLeft: 13,
        }}>
          Stellar: {attemptSummary.total} attempt{attemptSummary.total === 1 ? '' : 's'} · {attemptSummary.resolved}✓ · {attemptSummary.escalated}⚠ · {attemptSummary.paused}⏸
        </div>
      )}

      {/* Reason */}
      {watch.reason && (
        <div style={{
          fontSize: 11,
          color: 'var(--s-text-dim)',
          marginTop: 3,
          paddingLeft: 13,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}>
          {watch.reason}
        </div>
      )}

      {/* Last update from observer */}
      {watch.lastUpdate && (
        <div style={{
          fontSize: 11,
          color: 'var(--s-text-muted)',
          marginTop: 4,
          background: 'rgba(56,139,253,0.05)',
          borderRadius: 'var(--s-rs)',
          padding: '3px 6px 3px 13px',
        }}>
          {watch.lastUpdate}
        </div>
      )}

      {/* Stale indicator */}
      {watch.lastChecked && isStale(watch.lastChecked) && (
        <div style={{ fontSize: 10, color: 'var(--s-warning)', paddingLeft: 13, marginTop: 2 }}>
          ⚠ last checked {getRelativeTime(watch.lastChecked)} ago
        </div>
      )}

      {/* Action buttons — only shown when onAction is wired AND we have a usable kind */}
      {onAction && (
        <div
          onClick={(e) => e.stopPropagation()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
            }
          }}
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 6,
            paddingLeft: 13,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => onAction(investigatePrompt)}
            style={actionBtnStyle('var(--s-info)')}
            title="Pull logs and analyze"
          >
            🔍 Investigate
          </button>
          {actionType && (
            <button
              onClick={() => onAction(restartPrompt, {
                prompt: restartPrompt,
                actionType,
                cluster: watch.cluster,
                namespace: watch.namespace,
                name: restartTargetName,
              })}
              style={actionBtnStyle('var(--s-warning)')}
              title={`${actionType} on ${watch.namespace}/${restartTargetName}`}
            >
              ↻ Restart now
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 11,
    color,
    padding: '0 3px',
  }
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    background: 'none',
    border: `1px solid ${color}`,
    borderRadius: 'var(--s-rs)',
    padding: '2px 8px',
    fontSize: 11,
    color,
    cursor: 'pointer',
  }
}
