import type { StellarNotification, StellarSolve, StellarSolveProgress, StellarWatch } from '../../../types/stellar'

// Hours of attempt history to surface on watch cards. Anything older is past
// the user's attention window — keep the row terse.
const WATCH_ATTEMPT_LOOKBACK_HOURS = 24

export interface SolveStatus {
  label: string
  color: string
  isActive: boolean
}

/** Compute the visible status for an event given the solves list + live
 *  progress map from useStellar. Returns null if no solve has ever been
 *  attempted on this event. */
export function getSolveStatus(
  notificationId: string,
  solves: StellarSolve[],
  liveProgress: Record<string, StellarSolveProgress>,
): SolveStatus | null {
  const live = liveProgress[notificationId]
  if (live) {
    return { label: `Stellar: ${live.message}`, color: 'var(--s-info)', isActive: true }
  }
  const past = solves
    .filter(s => s.eventId === notificationId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  if (past.length === 0) return null
  const latest = past[0]
  switch (latest.status) {
    case 'running':
      return { label: 'Stellar solving…', color: 'var(--s-info)', isActive: true }
    case 'resolved':
      return { label: '✓ Resolved by Stellar', color: 'var(--s-success)', isActive: false }
    case 'escalated':
      return { label: '⚠ Escalated to you', color: 'var(--s-warning)', isActive: false }
    case 'exhausted':
      return { label: '⏸ Paused at budget', color: 'var(--s-warning)', isActive: false }
    default:
      return null
  }
}

export interface WatchAttemptSummary {
  total: number
  resolved: number
  escalated: number
  paused: number
  recent: StellarSolve[]
}

/** Roll up Stellar solve attempts against a single workload. Watch.cluster +
 *  Watch.namespace + Watch.resourceName form the key; solves carry the same
 *  triple as cluster/namespace/workload. */
export function getWatchAttemptSummary(
  watch: StellarWatch,
  solves: StellarSolve[],
): WatchAttemptSummary | null {
  const cutoff = Date.now() - WATCH_ATTEMPT_LOOKBACK_HOURS * 3600_000
  const relevant = (solves || []).filter(s => {
    if (s.cluster !== watch.cluster) return false
    if (s.namespace !== watch.namespace) return false
    if (s.workload && watch.resourceName && !watch.resourceName.startsWith(s.workload) && s.workload !== watch.resourceName) return false
    return new Date(s.startedAt).getTime() >= cutoff
  })
  if (relevant.length === 0) return null
  let resolved = 0, escalated = 0, paused = 0
  for (const s of relevant) {
    if (s.status === 'resolved') resolved++
    else if (s.status === 'escalated') escalated++
    else if (s.status === 'exhausted') paused++
  }
  return {
    total: relevant.length,
    resolved, escalated, paused,
    recent: relevant.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 10),
  }
}

// Thresholds — kept here so cards, modals, and badges agree.
const RECURRING_THRESHOLD = 3
const IMPORTANCE_RECURRING_BONUS = 15
const IMPORTANCE_DURATION_BONUS_MS = 5 * 60_000
const IMPORTANCE_DURATION_BONUS = 20
const IMPORTANCE_LONG_DURATION_MS = 15 * 60_000
const IMPORTANCE_LONG_DURATION_BONUS = 20
const TREND_WINDOW_MS = 24 * 3600_000

// Severity → base importance score.
const SEVERITY_SCORE: Record<string, number> = {
  critical: 50,
  warning: 30,
  info: 10,
}

export type ImportanceLabel = 'critical' | 'high' | 'medium' | 'low'

export interface Importance {
  score: number
  label: ImportanceLabel
}

export function severityColor(sev: string): string {
  if (sev === 'critical') return 'var(--s-critical)'
  if (sev === 'warning') return 'var(--s-warning)'
  return 'var(--s-info)'
}

/**
 * One-line "what's actually wrong" summary for a notification, derived from
 * its title. Returns null when there's no recognizable pattern — so the card
 * doesn't show a meaningless preview for opaque events.
 */
export function deriveShortReason(n: StellarNotification): string | null {
  const t = n.title.toLowerCase()
  if (t.includes('crashloop') || t.includes('backoff')) {
    return 'Pod stuck in a restart loop — container keeps exiting on startup.'
  }
  if (t.includes('oomkill') || t.includes('oom') || t.includes('memory')) {
    return 'Pod killed for exceeding its memory limit.'
  }
  if (t.includes('failedscheduling')) {
    return "Pod can't be placed — likely capacity or affinity constraint."
  }
  if (t.includes('failedmount') || t.includes('volume')) {
    return "Pod can't mount its volume — missing PVC, ConfigMap, or Secret."
  }
  if (t.includes('imagepullbackoff') || t.includes('errimagepull')) {
    return "Kubelet can't pull the image — bad tag, unreachable registry, or expired pull secret."
  }
  if (t.includes('failedcreate') || t.includes('failedcreatepodsandbox')) {
    return 'Pod sandbox creation failed — usually CNI, runtime, or admission issue.'
  }
  return null
}

export function deriveTags(n: StellarNotification, relatedCount: number): string[] {
  const tags: string[] = []
  const t = n.title.toLowerCase()
  const hints = n.actionHints || []
  if (hints.includes('restart') || hints.includes('scale')) tags.push('auto-fixable')
  if (relatedCount >= RECURRING_THRESHOLD) tags.push('recurring')
  if (t.includes('oom') || t.includes('memory')) tags.push('memory')
  if (t.includes('crashloop') || t.includes('backoff')) tags.push('crash-loop')
  if (t.includes('failedscheduling')) tags.push('scheduling')
  if (t.includes('failedmount') || t.includes('volume')) tags.push('storage')
  if (t.includes('imagepullbackoff') || t.includes('errimagepull')) tags.push('image-pull')
  return tags
}

/**
 * Count notifications sharing this notification's dedupeKey (excluding self).
 * Used by deriveTags to flag "recurring" and by deriveImportance for score.
 */
export function countRelated(n: StellarNotification, all: StellarNotification[]): number {
  if (!n.dedupeKey) return 0
  let count = 0
  for (const other of all) {
    if (other.id === n.id) continue
    if (other.dedupeKey === n.dedupeKey) count += 1
  }
  return count
}

/**
 * Compute importance score in [0, 100] approx. Mirrors spec §8.1 inputs that
 * are derivable from frontend state: severity, recurrence, duration since
 * first occurrence. Customer-impact factors (% users affected, SLA, revenue)
 * require backend data we don't have today — omitted intentionally.
 */
export function deriveImportance(
  n: StellarNotification,
  relatedCount: number,
): Importance {
  let score = SEVERITY_SCORE[n.severity] ?? 0
  if (relatedCount >= RECURRING_THRESHOLD) score += IMPORTANCE_RECURRING_BONUS
  const age = Date.now() - new Date(n.createdAt).getTime()
  if (age >= IMPORTANCE_DURATION_BONUS_MS) score += IMPORTANCE_DURATION_BONUS
  if (age >= IMPORTANCE_LONG_DURATION_MS) score += IMPORTANCE_LONG_DURATION_BONUS

  let label: ImportanceLabel
  if (score >= 90) label = 'critical'
  else if (score >= 65) label = 'high'
  else if (score >= 35) label = 'medium'
  else label = 'low'

  return { score, label }
}

export function importanceColor(label: ImportanceLabel): string {
  if (label === 'critical') return 'var(--s-critical)'
  if (label === 'high') return 'var(--s-warning)'
  if (label === 'medium') return 'var(--s-info)'
  return 'var(--s-text-muted)'
}

export type Trend = 'increasing' | 'decreasing' | 'stable' | 'idle'

export interface TrendStats {
  trend: Trend
  recent: number      // events in last 24h
  prior: number       // events in 24h before that
  sparkline: number[] // hourly bucket counts across the last 24h
}

/**
 * Compute trend for a watch by counting matching events in the last 24h
 * vs. the 24h before. Matching is best-effort: title/dedupeKey contains
 * resourceName, or fall back to deployment-name extracted from a pod name.
 */
export function deriveWatchTrend(
  watch: StellarWatch,
  notifications: StellarNotification[],
): TrendStats {
  const deploymentName = deploymentNameFromPodName(watch.resourceName)
  const recent: number[] = []
  const prior: number[] = []
  const now = Date.now()
  const sparkline = new Array(24).fill(0) as number[]

  for (const n of notifications) {
    if (!eventMatchesWatch(n, watch, deploymentName)) continue
    const t = new Date(n.createdAt).getTime()
    const age = now - t
    if (age <= TREND_WINDOW_MS) {
      recent.push(t)
      const hourBucket = Math.min(23, Math.floor(age / 3600_000))
      sparkline[23 - hourBucket] += 1
    } else if (age <= 2 * TREND_WINDOW_MS) {
      prior.push(t)
    }
  }

  let trend: Trend
  if (recent.length === 0 && prior.length === 0) trend = 'idle'
  else if (recent.length > prior.length * 1.25) trend = 'increasing'
  else if (recent.length * 1.25 < prior.length) trend = 'decreasing'
  else trend = 'stable'

  return { trend, recent: recent.length, prior: prior.length, sparkline }
}

export function trendIcon(trend: Trend): string {
  if (trend === 'increasing') return '↗'
  if (trend === 'decreasing') return '↘'
  if (trend === 'stable') return '↔'
  return '·'
}

/**
 * Render an hourly-bucket count array as a unicode block sparkline.
 * Returns empty string when there's no signal worth drawing.
 */
export function renderSparkline(buckets: number[]): string {
  if (!buckets || buckets.length === 0) return ''
  const max = Math.max(...buckets)
  if (max === 0) return ''
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
  return buckets
    .map(v => {
      if (v === 0) return blocks[0]
      const idx = Math.min(blocks.length - 1, Math.floor((v / max) * (blocks.length - 1)))
      return blocks[idx]
    })
    .join('')
}

export function trendColor(trend: Trend): string {
  if (trend === 'increasing') return 'var(--s-critical)'
  if (trend === 'decreasing') return 'var(--s-success)'
  if (trend === 'stable') return 'var(--s-text-muted)'
  return 'var(--s-text-dim)'
}

// --- internal helpers ---

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

function eventMatchesWatch(
  n: StellarNotification,
  watch: StellarWatch,
  deploymentName: string,
): boolean {
  if (n.cluster && n.cluster !== watch.cluster) return false
  if (n.namespace && watch.namespace && n.namespace !== watch.namespace) return false
  const t = n.title.toLowerCase()
  const rn = watch.resourceName.toLowerCase()
  const dn = deploymentName.toLowerCase()
  if (t.includes(rn)) return true
  if (dn !== rn && t.includes(dn)) return true
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
