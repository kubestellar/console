/**
 * Pure helpers for the OpenKruise Status card: display-item shaping, status/
 * category presentation lookups, and relative-time formatting.
 *
 * Extracted from index.tsx to keep the card component focused on data
 * wiring and rendering.
 */
import type { TFunction } from 'i18next'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle,
  Clock,
  Database,
  HardDrive,
  Boxes,
  Layers,
  PauseCircle,
  Play,
  Radio,
  Server,
  XCircle,
} from 'lucide-react'
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../../lib/constants/time'
import type { OpenKruiseDemoData } from './demoData'

/** Unified display item that all OpenKruise resource types map into. */
export interface OpenKruiseDisplayItem {
  id: string
  name: string
  namespace: string
  cluster: string
  category:
    | 'cloneset'
    | 'statefulset'
    | 'daemonset'
    | 'sidecarset'
    | 'broadcastjob'
    | 'cronjob'
  status: string
  primaryDetail: string
  secondaryDetail: string
  timestamp: string
}

export type CategoryOption =
  | ''
  | 'cloneset'
  | 'statefulset'
  | 'daemonset'
  | 'sidecarset'
  | 'broadcastjob'
  | 'cronjob'

export type SortByOption = 'status' | 'name' | 'category' | 'timestamp'
export type SortTranslationKey =
  | 'common:common.status'
  | 'common:common.name'
  | 'cards:openkruiseStatus.category'
  | 'cards:openkruiseStatus.updated'

export const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  error: 0,
  degraded: 1,
  pending: 2,
  paused: 2,
  suspended: 3,
  updating: 3,
  running: 4,
  active: 4,
  succeeded: 5,
  healthy: 5,
}

// Static Tailwind class maps so the JIT can statically detect the classes.
export const ICON_COLOR_CLASS: Record<string, string> = {
  green: 'text-green-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
  yellow: 'text-yellow-400',
  gray: 'text-gray-400',
  orange: 'text-orange-400',
}

// Issue 9071: `gray` entry uses semantic tokens so the neutral badge adapts to light/dark.
export const BADGE_COLOR_CLASS: Record<string, string> = {
  green: 'bg-green-500/20 text-green-400',
  red: 'bg-red-500/20 text-red-400',
  blue: 'bg-blue-500/20 text-blue-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  gray: 'bg-muted text-muted-foreground',
  orange: 'bg-orange-500/20 text-orange-400',
}

export const SORT_OPTIONS_KEYS: ReadonlyArray<{
  value: SortByOption
  labelKey: SortTranslationKey
}> = [
  { value: 'status', labelKey: 'common:common.status' },
  { value: 'name', labelKey: 'common:common.name' },
  { value: 'category', labelKey: 'cards:openkruiseStatus.category' },
  { value: 'timestamp', labelKey: 'cards:openkruiseStatus.updated' },
]

/** Transform every OpenKruise resource in `rawData` into a unified display item. */
export function buildDisplayItems(rawData: OpenKruiseDemoData, t: TFunction): OpenKruiseDisplayItem[] {
  const items: OpenKruiseDisplayItem[] = []

  for (const cs of rawData.cloneSets) {
    const partitionStr =
      cs.partition > 0
        ? `, ${t('openkruiseStatus.partition')} ${cs.partition}`
        : ''
    items.push({
      id: `cs-${cs.cluster}-${cs.namespace}-${cs.name}`,
      name: cs.name,
      namespace: cs.namespace,
      cluster: cs.cluster,
      category: 'cloneset',
      status: cs.status,
      primaryDetail: `${cs.readyReplicas}/${cs.replicas} ${t('openkruiseStatus.ready')} \u2022 ${cs.updateStrategy}${partitionStr}`,
      secondaryDetail: cs.image.split('/').pop() || cs.image,
      timestamp: cs.updatedAt,
    })
  }

  for (const ss of rawData.advancedStatefulSets) {
    items.push({
      id: `ss-${ss.cluster}-${ss.namespace}-${ss.name}`,
      name: ss.name,
      namespace: ss.namespace,
      cluster: ss.cluster,
      category: 'statefulset',
      status: ss.status,
      primaryDetail: `${ss.readyReplicas}/${ss.replicas} ${t('openkruiseStatus.ready')} \u2022 ${ss.podManagementPolicy} \u2022 ${ss.updateStrategy}`,
      secondaryDetail: ss.image.split('/').pop() || ss.image,
      timestamp: ss.updatedAt,
    })
  }

  for (const ds of rawData.advancedDaemonSets) {
    items.push({
      id: `ds-${ds.cluster}-${ds.namespace}-${ds.name}`,
      name: ds.name,
      namespace: ds.namespace,
      cluster: ds.cluster,
      category: 'daemonset',
      status: ds.status,
      primaryDetail: `${ds.numberReady}/${ds.desiredScheduled} ${t('openkruiseStatus.nodes')} \u2022 ${ds.rollingUpdateType}`,
      secondaryDetail: ds.image.split('/').pop() || ds.image,
      timestamp: ds.updatedAt,
    })
  }

  for (const sc of rawData.sidecarSets) {
    const containers = (sc.sidecarContainers || []).join(', ')
    items.push({
      id: `sc-${sc.cluster}-${sc.name}`,
      name: sc.name,
      namespace: '-',
      cluster: sc.cluster,
      category: 'sidecarset',
      status: sc.status,
      primaryDetail: `${sc.injectedPods}/${sc.matchedPods} ${t('openkruiseStatus.injected')} \u2022 ${sc.readyPods} ${t('openkruiseStatus.ready')}`,
      secondaryDetail: `${t('openkruiseStatus.containers')}: ${containers}`,
      timestamp: sc.updatedAt,
    })
  }

  for (const bj of rawData.broadcastJobs) {
    items.push({
      id: `bj-${bj.cluster}-${bj.namespace}-${bj.name}`,
      name: bj.name,
      namespace: bj.namespace,
      cluster: bj.cluster,
      category: 'broadcastjob',
      status: bj.status,
      primaryDetail: `${bj.succeeded}/${bj.desired} ${t('openkruiseStatus.succeeded')} \u2022 ${bj.active} ${t('openkruiseStatus.active')} \u2022 ${bj.failed} ${t('common:common.failed')}`,
      secondaryDetail: `${t('openkruiseStatus.completionPolicy')}: ${bj.completionPolicyType}`,
      timestamp: bj.completedAt ?? bj.startedAt,
    })
  }

  for (const cj of rawData.advancedCronJobs) {
    items.push({
      id: `cj-${cj.cluster}-${cj.namespace}-${cj.name}`,
      name: cj.name,
      namespace: cj.namespace,
      cluster: cj.cluster,
      category: 'cronjob',
      status: cj.status,
      primaryDetail: `${cj.schedule} \u2022 ${cj.templateKind} \u2022 ${cj.active} ${t('openkruiseStatus.active')}`,
      secondaryDetail: `${cj.successfulRuns} ${t('openkruiseStatus.runs')}, ${cj.failedRuns} ${t('common:common.failed')}`,
      timestamp: cj.lastScheduleTime ?? rawData.lastCheckTime,
    })
  }

  return items
}

export function getStatusIcon(status: string) {
  switch (status) {
    case 'succeeded':
    case 'healthy':
      return CheckCircle
    case 'failed':
    case 'error':
      return XCircle
    case 'running':
    case 'active':
      return Play
    case 'updating':
    case 'pending':
      return Clock
    case 'suspended':
    case 'paused':
      return PauseCircle
    default:
      return AlertTriangle
  }
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'succeeded':
    case 'healthy':
      return 'green'
    case 'failed':
    case 'error':
      return 'red'
    case 'running':
    case 'active':
      return 'blue'
    case 'updating':
    case 'pending':
      return 'yellow'
    case 'suspended':
    case 'paused':
      return 'gray'
    default:
      return 'orange'
  }
}

export function getCategoryIcon(category: string) {
  switch (category) {
    case 'cloneset':
      return Layers
    case 'statefulset':
      return Database
    case 'daemonset':
      return HardDrive
    case 'sidecarset':
      return Boxes
    case 'broadcastjob':
      return Radio
    case 'cronjob':
      return CalendarClock
    default:
      return Server
  }
}

export function getCategoryLabel(category: string, t: TFunction) {
  switch (category) {
    case 'cloneset':
      return t('openkruiseStatus.cloneSet')
    case 'statefulset':
      return t('openkruiseStatus.advancedStatefulSet')
    case 'daemonset':
      return t('openkruiseStatus.advancedDaemonSet')
    case 'sidecarset':
      return t('openkruiseStatus.sidecarSet')
    case 'broadcastjob':
      return t('openkruiseStatus.broadcastJob')
    case 'cronjob':
      return t('openkruiseStatus.advancedCronJob')
    default:
      return category
  }
}

export function formatTime(timestamp: string, t: TFunction) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < MS_PER_MINUTE) return `<1m ${t('openkruiseStatus.ago')}`
  if (diff < MS_PER_HOUR)
    return `${Math.max(1, Math.floor(diff / MS_PER_MINUTE))}m ${t('openkruiseStatus.ago')}`
  if (diff < MS_PER_DAY)
    return `${Math.floor(diff / MS_PER_HOUR)}h ${t('openkruiseStatus.ago')}`
  return `${Math.floor(diff / MS_PER_DAY)}d ${t('openkruiseStatus.ago')}`
}
