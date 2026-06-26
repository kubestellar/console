import { Gauge, Cpu, HardDrive, Box, Zap, type LucideIcon } from 'lucide-react'
import { commonComparators } from '../../lib/cards/cardHooks'
import type { QuotaUsage, LimitRangeItem, SortByOption } from './NamespaceQuotas.types'

export const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'percent' as const, label: 'Usage' },
]

export const QUOTA_SORT_COMPARATORS: Record<SortByOption, (a: QuotaUsage, b: QuotaUsage) => number> = {
  name: commonComparators.string<QuotaUsage>('resource'),
  percent: commonComparators.number<QuotaUsage>('percent'),
}

export const LIMIT_SORT_COMPARATORS: Record<SortByOption, (a: LimitRangeItem, b: LimitRangeItem) => number> = {
  name: commonComparators.string<LimitRangeItem>('name'),
  percent: commonComparators.string<LimitRangeItem>('name'),
}

export const USAGE_TEXT_CLASSES: Record<string, string> = {
  red: 'text-red-400',
  orange: 'text-orange-400',
  green: 'text-green-400',
}

export const USAGE_BAR_CLASSES: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  green: 'bg-green-500',
}

export function getColor(percent: number): string {
  if (percent >= 90) return 'red'
  if (percent >= 70) return 'orange'
  return 'green'
}

export function getIcon(resource: string): LucideIcon {
  if (resource.toLowerCase().includes('cpu')) return Cpu
  if (resource.toLowerCase().includes('memory')) return HardDrive
  if (resource.toLowerCase().includes('pod')) return Box
  if (resource.toLowerCase().includes('gpu')) return Zap
  return Gauge
}

export function parseQuantity(value: string): number {
  if (!value) return 0
  const num = parseFloat(value)
  if (value.endsWith('Gi')) return num * 1024 * 1024 * 1024
  if (value.endsWith('Mi')) return num * 1024 * 1024
  if (value.endsWith('Ki')) return num * 1024
  if (value.endsWith('G')) return num * 1000000000
  if (value.endsWith('M')) return num * 1000000
  if (value.endsWith('K')) return num * 1000
  if (value.endsWith('m')) return num / 1000
  return num
}

export function formatResourceName(name: string): string {
  const formatted = name
    .replace(/^requests\./, '')
    .replace(/^limits\./, '')

  if (formatted.includes('nvidia.com/gpu')) return 'GPU (NVIDIA)'
  if (formatted.includes('amd.com/gpu')) return 'GPU (AMD)'
  if (formatted.includes('cpu')) return 'CPU'
  if (formatted.includes('memory')) return 'Memory'
  if (formatted.includes('storage')) return 'Storage'
  if (formatted.includes('ephemeral-storage')) return 'Ephemeral Storage'

  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

export function formatLimits(limits: Record<string, string>): string {
  return Object.entries(limits)
    .map(([key, value]) => `${formatResourceName(key)}: ${value}`)
    .join(', ')
}
