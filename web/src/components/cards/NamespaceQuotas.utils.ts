import type { QuotaUsage, LimitRangeItem, SortByOption } from './NamespaceQuotas.types'
import { commonComparators } from '../../lib/cards/cardHooks'

export const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'percent' as const, label: 'Usage' },
]

export const QUOTA_SORT_COMPARATORS: Record<SortByOption, (a: QuotaUsage, b: QuotaUsage) => number> = {
  name: commonComparators.string<QuotaUsage>('resource'),
  percent: commonComparators.number<QuotaUsage>('percent') }

export const LIMIT_SORT_COMPARATORS: Record<SortByOption, (a: LimitRangeItem, b: LimitRangeItem) => number> = {
  name: commonComparators.string<LimitRangeItem>('name'),
  // For limits, sort by name for both options (no percent on limits)
  percent: commonComparators.string<LimitRangeItem>('name') }

/**
 * Parse Kubernetes quantity string to numeric value
 * Handles resource quantities like "4Gi", "1000m", "2.5", etc.
 */
export function parseQuantity(value: string): number {
  if (!value) return 0
  const num = parseFloat(value)
  if (value.endsWith('Gi')) return num * 1024 * 1024 * 1024
  if (value.endsWith('Mi')) return num * 1024 * 1024
  if (value.endsWith('Ki')) return num * 1024
  if (value.endsWith('G')) return num * 1000000000
  if (value.endsWith('M')) return num * 1000000
  if (value.endsWith('K')) return num * 1000
  if (value.endsWith('m')) return num / 1000 // millicores
  return num
}

/**
 * Format resource name for display (capitalize, remove prefixes, etc.)
 */
export function formatResourceName(name: string): string {
  // Remove common prefixes
  let formatted = name
    .replace(/^requests\./, '')
    .replace(/^limits\./, '')
  
  // Special formatting for known resource types
  if (formatted.includes('nvidia.com/gpu')) return 'GPU (NVIDIA)'
  if (formatted.includes('amd.com/gpu')) return 'GPU (AMD)'
  if (formatted.includes('cpu')) return 'CPU'
  if (formatted.includes('memory')) return 'Memory'
  if (formatted.includes('storage')) return 'Storage'
  if (formatted.includes('ephemeral-storage')) return 'Ephemeral Storage'
  
  // Capitalize first letter
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

/**
 * Format limits object for display
 */
export function formatLimits(limits: Record<string, string>): string {
  return Object.entries(limits)
    .map(([key, value]) => `${formatResourceName(key)}: ${value}`)
    .join(', ')
}
