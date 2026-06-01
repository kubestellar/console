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
      aria-label={`Open watch details for ${watch.namespace}/${watch.resourceName}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetail?.(watch)
        }
      }}
      className="mb-1 px-2.5 py-2"
      style={{
        background: 'var(--s-surface-2)',
        border: '1px solid var(--s-border)',
        borderLeftWidth: 3,
        borderLeftColor: 'var(--s-info)',
        borderRadius: 'var(--s-r)',
        cursor: onOpenDetail ? 'pointer' : 'default',
      }}
    >
      {/* Header row */}
      <div
        onClick={(e) => e.stopPropagation()}
        role="button"
        tabIndex={0}
        aria-label={`Quick actions for ${watch.namespace}/${watch.resourceName}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        className="flex items-center gap-1.5"
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
        <span className="text-xs" style={{
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
          className="px-1 text-[11px]"
          onClick={() => onSnooze(watch.id, 60)}
          title="Snooze 1h"
          style={iconBtnStyle('var(--s-text-dim)')}
        >⏸</button>
        <button
          className="px-1 text-[11px]"
          onClick={() => onResolve(watch.id)}
          title="Mark resolved"
          style={iconBtnStyle('var(--s-success)')}
        >✓</button>
        <button
          className="px-1 text-[11px]"
          onClick={() => onDismiss(watch.id)}
          title="Dismiss"
          style={iconBtnStyle('var(--s-text-dim)')}
        >✕</button>
      </div>

      {/* Meta */}
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 pl-3 text-[10px] font-mono" style={{
        color: 'var(--s-text-muted)',
      }}>
        <span>{watch.resourceKind} · {watch.cluster}</span>
        {showTrend && (
          <span
            title={`${trendStats.recent} events in last 24h (prior 24h: ${trendStats.prior}) · hourly distribution shown`}
            className="inline-flex items-center gap-1 px-1"
            style={{
              color: trendColor(trendStats.trend),
              border: `1px solid ${trendColor(trendStats.trend)}`,
              borderRadius: 6,
              fontWeight: 600,
            }}
          >
            <span className="text-[11px]">{trendIcon(trendStats.trend)}</span>
            <span>{trendStats.recent}/24h</span>
            {renderSparkline(trendStats.sparkline) && (
              <span className="font-mono" style={{ letterSpacing: '-1px', opacity: 0.8 }}>
                {renderSparkline(trendStats.sparkline)}
              </span>
            )}
          </span>
        )}
      </div>

      {attemptSummary && (
        <div className="mt-1 pl-3 text-[10px] font-mono" style={{
          color: 'var(--s-text-muted)',
        }}>
          Stellar: {attemptSummary.total} attempt{attemptSummary.total === 1 ? '' : 's'} · {attemptSummary.resolved}✓ · {attemptSummary.escalated}⚠ · {attemptSummary.paused}⏸
        </div>
      )}

      {/* Reason */}
      {watch.reason && (
        <div className="mt-1 pl-3 text-[11px]" style={{
          color: 'var(--s-text-dim)',
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}>
          {watch.reason}
        </div>
      )}

      {/* Last update from observer */}
      {watch.lastUpdate && (
        <div className="mt-1 pl-3 pr-1.5 py-1 text-[11px]" style={{
          color: 'var(--s-text-muted)',
          background: 'rgba(56,139,253,0.05)',
          borderRadius: 'var(--s-rs)',
        }}>
          {watch.lastUpdate}
        </div>
      )}

      {/* Stale indicator */}
      {watch.lastChecked && isStale(watch.lastChecked) && (
        <div className="mt-0.5 pl-3 text-[10px]" style={{ color: 'var(--s-warning)' }}>
          ⚠ last checked {getRelativeTime(watch.lastChecked)} ago
        </div>
      )}

      {/* Action buttons — only shown when onAction is wired AND we have a usable kind */}
      {onAction && (
        <div
          onClick={(e) => e.stopPropagation()}
          role="button"
          tabIndex={0}
          aria-label={`Watch actions for ${watch.namespace}/${watch.resourceName}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
            }
          }}
          className="mt-1.5 flex flex-wrap gap-1.5 pl-3"
        >
          <button
            className="flex items-center gap-1 px-2 py-0.5 text-[11px]"
            onClick={() => onAction(investigatePrompt)}
            style={actionBtnStyle('var(--s-info)')}
            title="Pull logs and analyze"
          >
            🔍 Investigate
          </button>
          {actionType && (
            <button
              className="flex items-center gap-1 px-2 py-0.5 text-[11px]"
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
    color,
  }
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    background: 'none',
    border: `1px solid ${color}`,
    borderRadius: 'var(--s-rs)',
    color,
    cursor: 'pointer',
  }
}
