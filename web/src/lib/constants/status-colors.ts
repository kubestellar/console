/**
 * Status color constants for consistent styling across the application.
 *
 * These colors are used for status indicators, badges, and UI elements that
 * communicate health, warning, error, and info states. The design system
 * standardizes on these specific Tailwind classes with consistent opacity levels.
 *
 * Standard pattern:
 * - Success/healthy: text-green-400, bg-green-500/10, border-green-500/20
 * - Error/critical: text-red-400, bg-red-500/10, border-red-500/20
 * - Warning: text-yellow-400, bg-yellow-500/10, border-yellow-500/20
 * - Info: text-blue-400, bg-blue-500/10, border-blue-500/20
 */

/** Text color classes for status indicators */
export const STATUS_TEXT_COLORS = {
  success: 'text-green-400',
  healthy: 'text-green-400',
  normal: 'text-green-400',
  passing: 'text-green-400',
  deployed: 'text-green-400',
  bound: 'text-green-400',
  warning: 'text-yellow-400',
  pending: 'text-yellow-400',
  unreachable: 'text-yellow-400',
  error: 'text-red-400',
  critical: 'text-red-400',
  unhealthy: 'text-red-400',
  failed: 'text-red-400',
  failing: 'text-red-400',
  errors: 'text-red-400',
  issues: 'text-red-400',
  high: 'text-red-400',
  info: 'text-blue-400',
} as const

/** Background color classes for status containers (10% opacity) */
export const STATUS_BG_COLORS = {
  success: 'bg-green-500/10',
  healthy: 'bg-green-500/10',
  warning: 'bg-yellow-500/10',
  error: 'bg-red-500/10',
  critical: 'bg-red-500/10',
  info: 'bg-blue-500/10',
} as const

/** Border color classes for status containers (20% opacity) */
export const STATUS_BORDER_COLORS = {
  success: 'border-green-500/20',
  healthy: 'border-green-500/20',
  warning: 'border-yellow-500/20',
  error: 'border-red-500/20',
  critical: 'border-red-500/20',
  info: 'border-blue-500/20',
} as const

/** Combined status classes for common use cases */
export const STATUS_CLASSES = {
  success: {
    text: STATUS_TEXT_COLORS.success,
    bg: STATUS_BG_COLORS.success,
    border: STATUS_BORDER_COLORS.success,
    combined: 'bg-green-500/10 text-green-400 border-green-500/20',
  },
  healthy: {
    text: STATUS_TEXT_COLORS.healthy,
    bg: STATUS_BG_COLORS.healthy,
    border: STATUS_BORDER_COLORS.healthy,
    combined: 'bg-green-500/10 text-green-400 border-green-500/20',
  },
  warning: {
    text: STATUS_TEXT_COLORS.warning,
    bg: STATUS_BG_COLORS.warning,
    border: STATUS_BORDER_COLORS.warning,
    combined: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  },
  error: {
    text: STATUS_TEXT_COLORS.error,
    bg: STATUS_BG_COLORS.error,
    border: STATUS_BORDER_COLORS.error,
    combined: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  critical: {
    text: STATUS_TEXT_COLORS.critical,
    bg: STATUS_BG_COLORS.critical,
    border: STATUS_BORDER_COLORS.critical,
    combined: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  info: {
    text: STATUS_TEXT_COLORS.info,
    bg: STATUS_BG_COLORS.info,
    border: STATUS_BORDER_COLORS.info,
    combined: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
} as const

/** Helper to get status classes based on a status string */
export function getStatusClasses(status: string): {
  text: string
  bg: string
  border: string
  combined: string
} {
  const normalizedStatus = status.toLowerCase()
  if (normalizedStatus in STATUS_CLASSES) {
    return STATUS_CLASSES[normalizedStatus as keyof typeof STATUS_CLASSES]
  }
  // Default to info for unknown statuses
  return STATUS_CLASSES.info
}
