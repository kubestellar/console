// ============================================================================
// Centralized Status Color System
//
// All cards MUST use these functions instead of defining inline color mappings.
// See component-criteria.md for usage guidelines.
// ============================================================================

/**
 * Severity levels for status-based coloring
 */
export type StatusSeverity = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'muted'

/**
 * Complete color set for a status severity level.
 * All values are Tailwind CSS class strings.
 */
export interface StatusColorSet {
  /** Text color — e.g., 'text-green-400' */
  text: string
  /** Background color — e.g., 'bg-green-500/20' */
  bg: string
  /** Border color — e.g., 'border-green-500/20' */
  border: string
  /** Icon background — e.g., 'bg-green-500/10' */
  iconBg: string
  /** Solid bar/progress color — e.g., 'bg-green-500' */
  barColor: string
}

/**
 * Canonical status colors for each severity level.
 * Uses /20 opacity for badges and backgrounds, /10 for subtle icon backgrounds.
 */
export const STATUS_COLORS: Record<StatusSeverity, StatusColorSet> = {
  success: {
    text: 'text-green-400',
    bg: 'bg-green-500/20',
    border: 'border-green-500/20',
    iconBg: 'bg-green-500/10',
    barColor: 'bg-green-500',
  },
  warning: {
    text: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500/20',
    iconBg: 'bg-yellow-500/10',
    barColor: 'bg-yellow-500',
  },
  error: {
    text: 'text-red-400',
    bg: 'bg-red-500/20',
    border: 'border-red-500/20',
    iconBg: 'bg-red-500/10',
    barColor: 'bg-red-500',
  },
  info: {
    text: 'text-blue-400',
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/20',
    iconBg: 'bg-blue-500/10',
    barColor: 'bg-blue-500',
  },
  neutral: {
    text: 'text-muted-foreground',
    bg: 'bg-secondary',
    border: 'border-border',
    iconBg: 'bg-secondary/50',
    barColor: 'bg-secondary',
  },
  muted: {
    text: 'text-gray-400',
    bg: 'bg-gray-500/20',
    border: 'border-gray-500/20',
    iconBg: 'bg-gray-500/10',
    barColor: 'bg-gray-500',
  },
}

// Keywords mapped to severity levels (lowercase, checked with includes)
const SEVERITY_KEYWORDS: Array<[string[], StatusSeverity]> = [
  // Error — check first (most specific)
  [['crashloop', 'oomkill', 'oom', 'failed', 'error', 'crash', 'evict', 'unhealthy', 'unavailable', 'replicafailure', 'backoff', 'imagepull', 'errimagepull'], 'error'],
  // Warning
  [['pending', 'waiting', 'creating', 'progressing', 'terminating', 'unknown', 'offline', 'unreachable', 'degraded', 'stale'], 'warning'],
  // Success
  [['running', 'healthy', 'ready', 'active', 'deployed', 'succeeded', 'bound', 'available', 'synced', 'compliant', 'passing', 'resolved', 'installed', 'complete'], 'success'],
  // Info
  [['info', 'normal', 'scheduled', 'pulled', 'created', 'started'], 'info'],
]

/**
 * Map a Kubernetes status string to a severity level.
 * Uses fuzzy matching — checks if the lowercase status contains any known keywords.
 *
 * @example
 * getStatusSeverity('CrashLoopBackOff') // => 'error'
 * getStatusSeverity('Running')          // => 'success'
 * getStatusSeverity('Pending')          // => 'warning'
 * getStatusSeverity('custom-thing')     // => 'neutral'
 */
export function getStatusSeverity(status: string | undefined | null): StatusSeverity {
  if (!status) return 'neutral'
  const lower = status.toLowerCase()
  for (const [keywords, severity] of SEVERITY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return severity
    }
  }
  return 'neutral'
}

/**
 * Get the full color set for a Kubernetes status string.
 * Convenience wrapper combining getStatusSeverity + STATUS_COLORS lookup.
 *
 * @example
 * const colors = getStatusColors('CrashLoopBackOff')
 * // colors.text => 'text-red-400'
 * // colors.bg   => 'bg-red-500/20'
 */
export function getStatusColors(status: string | undefined | null): StatusColorSet {
  return STATUS_COLORS[getStatusSeverity(status)]
}

/**
 * Get the full color set for a known severity level.
 *
 * @example
 * const colors = getSeverityColors('success')
 */
export function getSeverityColors(severity: StatusSeverity): StatusColorSet {
  return STATUS_COLORS[severity]
}
