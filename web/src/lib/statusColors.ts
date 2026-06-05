/** Standardized status color classes for consistent UI */
export const STATUS_COLORS = {
  success: {
    text: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    dot: 'bg-green-400',
  },
  error: {
    text: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    dot: 'bg-red-400',
  },
  warning: {
    text: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    dot: 'bg-yellow-400',
  },
  info: {
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    dot: 'bg-blue-400',
  },
  neutral: {
    text: 'text-muted-foreground',
    bg: 'bg-secondary/30',
    border: 'border-border',
    dot: 'bg-gray-400',
  },
} as const

export type StatusType = keyof typeof STATUS_COLORS
export type SeverityType = 'critical' | 'warning' | 'info'

/** Get color classes for a health status */
export function getHealthColors(isHealthy: boolean) {
  return isHealthy ? STATUS_COLORS.success : STATUS_COLORS.error
}

/** Get color classes for a severity level */
export function getSeverityColors(severity: SeverityType) {
  switch (severity) {
    case 'critical':
      return STATUS_COLORS.error
    case 'warning':
      return STATUS_COLORS.warning
    case 'info':
      return STATUS_COLORS.info
  }
}
