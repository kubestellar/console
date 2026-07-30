import type { StellarNotification } from '../../../types/stellar'

export interface PendingAction {
  prompt: string
  actionType: string
  cluster: string
  namespace: string
  name: string
}

/** Loose translator type for dynamic key lookup in action config. */
export type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

export const REVERSIBLE_ACTION_TYPES = ['ScaleDeployment', 'RestartDeployment']

export const HINT_TO_ACTION_TYPE: Record<string, string> = {
  restart: 'RestartDeployment',
  scale: 'ScaleDeployment',
  investigate: 'investigate',
  solve: 'solve',
}

export const ACTION_CONFIG: Record<string, { labelKey: string; icon: string; color: string }> = {
  investigate: { labelKey: 'stellar.eventCard.actions.investigate', icon: '🔍', color: 'var(--s-info)' },
  restart: { labelKey: 'stellar.eventCard.actions.restart', icon: '↻', color: 'var(--s-warning)' },
  scale: { labelKey: 'stellar.eventCard.actions.scale', icon: '↕', color: 'var(--s-info)' },
  solve: { labelKey: 'stellar.eventCard.actions.solve', icon: '✦', color: 'var(--s-success)' },
}

/** Format countdown from timestamp to short human-readable string (e.g., "2m 30s"). */
export function formatCountdownShort(recheckAt: number): string {
  const ms = recheckAt - Date.now()
  if (ms <= 0) return 'now'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${seconds}s`
}

export function extractResourceName(notification: StellarNotification): string {
  if (notification.dedupeKey) {
    const parts = notification.dedupeKey.split(':')
    const offset = parts[0] === 'ev' ? 1 : 0
    if (parts.length >= offset + 3) {
      return parts[offset + 2]
    }
  }
  return ''
}

export function isCompletedReversibleAction(notification: StellarNotification): boolean {
  if (notification.type !== 'action') return false
  if (!notification.title.startsWith('Action completed')) return false
  return REVERSIBLE_ACTION_TYPES.some(t => notification.title.includes(t) || notification.body.includes(t))
}

export function buildRollbackPrompt(notification: StellarNotification): string {
  for (const actionType of REVERSIBLE_ACTION_TYPES) {
    if (notification.title.includes(actionType) || notification.body.includes(actionType)) {
      const ns = notification.namespace ? `${notification.namespace}/` : ''
      return `Undo the last ${actionType} on ${ns}${notification.cluster} — restore previous state`
    }
  }
  return `Undo the last action on ${notification.cluster}`
}

export function buildActionPrompt(hint: string, notification: StellarNotification): string {
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
export function deriveActionHints(notification: StellarNotification): string[] {
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
