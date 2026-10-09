import { CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle } from 'lucide-react'
import type { ArgoApplication } from '../../hooks/useArgoCD'
import { commonComparators } from '../../lib/cards/cardHooks'

export interface ArgoCDApplicationsProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

export type SortByOption = 'syncStatus' | 'healthStatus' | 'name' | 'namespace'
export type SortTranslationKey = 'argoCDApplications.sortSyncStatus' | 'argoCDApplications.sortHealth' | 'argoCDApplications.sortName' | 'argoCDApplications.sortNamespace'

export const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; labelKey: SortTranslationKey }> = [
  { value: 'syncStatus' as const, labelKey: 'argoCDApplications.sortSyncStatus' },
  { value: 'healthStatus' as const, labelKey: 'argoCDApplications.sortHealth' },
  { value: 'name' as const, labelKey: 'argoCDApplications.sortName' },
  { value: 'namespace' as const, labelKey: 'argoCDApplications.sortNamespace' },
]

export const syncStatusConfig = {
  Synced: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' },
  OutOfSync: { icon: RefreshCw, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  Unknown: { icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-gray-500/20 dark:bg-gray-400/20' } }

export const healthStatusConfig = {
  Healthy: { icon: CheckCircle, color: 'text-green-400' },
  Degraded: { icon: XCircle, color: 'text-red-400' },
  Progressing: { icon: Clock, color: 'text-blue-400' },
  Missing: { icon: AlertTriangle, color: 'text-orange-400' },
  Unknown: { icon: AlertTriangle, color: 'text-muted-foreground' } }

export const syncOrder: Record<string, number> = { OutOfSync: 0, Unknown: 1, Synced: 2 }
export const healthOrder: Record<string, number> = { Degraded: 0, Missing: 1, Progressing: 2, Unknown: 3, Healthy: 4 }

export const ARGO_SORT_COMPARATORS = {
  syncStatus: (a: ArgoApplication, b: ArgoApplication) => (syncOrder[a.syncStatus] ?? 5) - (syncOrder[b.syncStatus] ?? 5),
  healthStatus: (a: ArgoApplication, b: ArgoApplication) => (healthOrder[a.healthStatus] ?? 5) - (healthOrder[b.healthStatus] ?? 5),
  name: commonComparators.string<ArgoApplication>('name'),
  namespace: commonComparators.string<ArgoApplication>('namespace') }
