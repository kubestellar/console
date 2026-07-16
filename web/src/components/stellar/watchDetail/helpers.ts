import type { CSSProperties } from 'react'
import type { StellarNotification, StellarWatch } from '../../../types/stellar'

export const EVENT_TIMELINE_LIMIT = 10
export const STALE_THRESHOLD_MS = 10 * 60 * 1000
export const RECURRING_EVENT_THRESHOLD = 3
export const FREQUENCY_WINDOW_HOURS = 24

export const WATCH_TIMELINE_TIMESTAMP_STYLE = {
  fontFamily: 'var(--s-mono)',
  color: 'var(--s-text-muted)',
  minWidth: 70,
} as const

export function severityColor(sev: string): string {
  if (sev === 'critical') return 'var(--s-critical)'
  if (sev === 'warning') return 'var(--s-warning)'
  return 'var(--s-info)'
}

export function deploymentNameFromPodName(podName: string): string {
  const parts = podName.split('-')
  if (parts.length < 3) return podName
  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  const looksLikeRS = /^[a-z0-9]{5,10}$/.test(prev)
  const looksLikePodSuffix = last.length >= 4 && last.length <= 6 && /^[a-z0-9]+$/.test(last)
  if (looksLikeRS && looksLikePodSuffix) return parts.slice(0, -2).join('-')
  return podName
}

export function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`
  if (ms < 3600_000) return `${Math.floor(ms / 60000)}m`
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`
  return `${Math.floor(ms / 86400_000)}d`
}

export function matchesWatch(n: StellarNotification, watch: StellarWatch, deploymentName: string): boolean {
  if (n.cluster && n.cluster !== watch.cluster) return false
  if (n.namespace && watch.namespace && n.namespace !== watch.namespace) return false
  const t = n.title.toLowerCase()
  if (t.includes(watch.resourceName.toLowerCase())) return true
  if (deploymentName && deploymentName !== watch.resourceName && t.includes(deploymentName.toLowerCase())) return true
  // Also match via dedupeKey resource segment
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

export function footerBtn(color: string): CSSProperties {
  return {
    background: 'none', border: `1px solid ${color}`, color,
    borderRadius: 'var(--s-rs)',
    fontSize: 11, cursor: 'pointer',
  }
}
