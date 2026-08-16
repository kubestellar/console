/**
 * Constants for EnterpriseComplianceCards component
 */

export const SCORE_GOOD = 'hsl(var(--chart-success, 142 71% 45%))'
export const SCORE_WARN = 'hsl(var(--chart-warning, 45 93% 47%))'
export const SCORE_BAD = 'hsl(var(--chart-danger, 0 84% 60%))'
export const RING_BG = 'hsl(var(--muted) / 0.4)'
export const ENTERPRISE_SUMMARY_CACHE_PREFIX = 'enterprise-summary:'

export const SCORE_THRESHOLDS = {
  GOOD: 80,
  WARN: 60,
} as const

export const DEFAULT_RING_SIZE = 64
