import type { ClusterEvent } from '../../hooks/mcp/types'
import type { InsightCategory } from '../../types/insights'
import { REASON_TO_FAMILY } from './constants'

export function workloadPrefix(objectRef: string): string {
  const prefixes = ['pod/', 'deployment/', 'replicaset/', 'statefulset/', 'daemonset/', 'job/']
  if (!prefixes.some(prefix => objectRef.startsWith(prefix))) return objectRef

  const name = objectRef.includes('/') ? objectRef.split('/')[1] : objectRef
  const twoSuffix = name.replace(/-(?=[a-z0-9]*\d)[a-z0-9]{5,10}-[a-z0-9]{3,6}$/, '')
  if (twoSuffix !== name) return twoSuffix

  const oneSuffix = name.replace(/-(?=[a-z0-9]*\d)[a-z0-9]{5,10}$/, '')
  return oneSuffix !== name ? oneSuffix : name
}

export function isCausallyRelated(a: ClusterEvent, b: ClusterEvent): boolean {
  const familyA = REASON_TO_FAMILY.get(a.reason)
  const familyB = REASON_TO_FAMILY.get(b.reason)
  if (familyA !== undefined && familyB !== undefined && familyA === familyB) return true
  return workloadPrefix(a.object) === workloadPrefix(b.object)
}

export function generateId(category: InsightCategory, ...parts: string[]): string {
  return `${category}:${parts.join(':')}`
}

export function now(): string {
  return new Date().toISOString()
}

export function parseTimestamp(ts?: string): number {
  if (!ts) return 0
  const time = new Date(ts).getTime()
  return Number.isNaN(time) ? 0 : time
}

export function pct(value: number | undefined, total: number | undefined): number {
  if (value == null || total == null || total === 0) return 0
  return Math.round((value / total) * 100)
}
