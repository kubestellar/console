import { useMemo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useClusters, useHelmReleases, useOperatorSubscriptions } from '../../hooks/useMCP'
import { useToast } from '../ui/Toast'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { getStoredAuthToken } from '../../lib/authToken'
import { agentFetch } from '../../hooks/mcp/shared'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import { getDemoMode } from '../../hooks/useDemoMode'
import type { StatBlockValue } from '../ui/StatsOverview'
import { getDefaultCards } from '../../config/dashboards'
import type { GitOpsAppConfig, GitOpsApp, DriftResult } from './GitOps.types'

const DRIFT_HEALTHCHECK_TIMEOUT_MS = 3000
const EXACTLY_ONE_CLUSTER = 1

export const GITOPS_STORAGE_KEY = 'kubestellar-gitops-dashboard-cards'
export const DEFAULT_GITOPS_CARDS = getDefaultCards('gitops')

function getGitOpsAppConfigs(): GitOpsAppConfig[] {
  return [
    { name: 'gatekeeper', namespace: 'gatekeeper-system', cluster: '', repoUrl: 'https://github.com/open-policy-agent/gatekeeper', path: 'deploy/' },
    { name: 'kuberay-operator', namespace: 'ray-system', cluster: '', repoUrl: 'https://github.com/ray-project/kuberay', path: 'ray-operator/config/default/' },
    { name: 'kserve', namespace: 'kserve', cluster: '', repoUrl: 'https://github.com/kserve/kserve', path: 'config/default/' },
    { name: 'gpu-operator', namespace: 'gpu-operator', cluster: '', repoUrl: 'https://github.com/NVIDIA/gpu-operator', path: 'deployments/gpu-operator/' },
  ]
}

export function getTimeAgo(timestamp: string | undefined, t: TFunction): string {
  if (!timestamp) return t('gitops.unknown')
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / MS_PER_MINUTE)
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours > 0) return t('gitops.hoursAgo', { count: diffHours })
  if (diffMins > 0) return t('gitops.minutesAgo', { count: diffMins })
  return t('gitops.justNow')
}

export function useGitOps() {
  const { t } = useTranslation(['common', 'cards'])
  const { clusters, deduplicatedClusters, isRefreshing: dataRefreshing, refetch } = useClusters()
  const { releases: helmReleases } = useHelmReleases()
  const { subscriptions: operatorSubs } = useOperatorSubscriptions()
  const { drillToAllHelm, drillToAllOperators } = useDrillDownActions()
  const { showToast } = useToast()

  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [syncedApps, setSyncedApps] = useState<Set<string>>(new Set())
  const [syncDialogApp, setSyncDialogApp] = useState<GitOpsApp | null>(null)
  const [driftResults, setDriftResults] = useState<Map<string, DriftResult>>(new Map())
  const [isDetecting, setIsDetecting] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [syncedAt, setSyncedAt] = useState<Map<string, string>>(new Map())

  const cachedHelmCount = useRef(0)
  const detectAllDriftRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  const clusterDisplayName = (c: { context?: string; name: string }): string =>
    c.context || c.name.split('/').pop() || ''

  const resolveAppCluster = (preferred: string): { cluster: string; ambiguous: boolean } => {
    if (preferred) return { cluster: preferred, ambiguous: false }
    // Only auto-select when there is exactly one cluster to avoid silently
    // ignoring all others in a multi-cluster deployment.
    if (deduplicatedClusters.length === EXACTLY_ONE_CLUSTER) {
      const only = deduplicatedClusters[0]
      if (only) return { cluster: clusterDisplayName(only), ambiguous: false }
    }
    return { cluster: '', ambiguous: deduplicatedClusters.length > EXACTLY_ONE_CLUSTER }
  }

  const handleRefresh = () => {
    refetch()
    void detectAllDriftRef.current()
    setLastUpdated(new Date())
  }

  useEffect(() => {
    if (getDemoMode()) {
      setIsDetecting(false)
      return
    }

    let cancelled = false

    async function detectAllDrift() {
      try {
        const health = await fetch('/api/health', { signal: AbortSignal.timeout(DRIFT_HEALTHCHECK_TIMEOUT_MS) })
        if (!health.ok) {
          setIsDetecting(false)
          return
        }
      } catch {
        setIsDetecting(false)
        return
      }

      if (cancelled) return

      setIsDetecting(true)
      const results = new Map<string, DriftResult>()
      const configs = getGitOpsAppConfigs().map(c => {
        const resolved = resolveAppCluster(c.cluster)
        return { ...c, cluster: resolved.cluster, clusterAmbiguous: resolved.ambiguous }
      })

      const token = await getStoredAuthToken()
      const agentAuthHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      }
      if (token) agentAuthHeaders['Authorization'] = `Bearer ${token}`
      const promises = configs.map(async (appConfig) => {
        try {
          const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/gitops/detect-drift`, {
            method: 'POST',
            headers: agentAuthHeaders,
            body: JSON.stringify({
              repoUrl: appConfig.repoUrl,
              path: appConfig.path,
              namespace: appConfig.namespace,
              cluster: appConfig.cluster || undefined,
            }),
            signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
          })
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}))
            throw new Error(errBody.error || `detect-drift failed (HTTP ${res.status})`)
          }
          const data = (await res.json()) as {
            drifted: boolean
            resources: DriftResult['resources']
            rawDiff?: string
          }
          return {
            name: appConfig.name,
            result: {
              status: 'ok' as const,
              drifted: data.drifted,
              resources: data.resources || [] } satisfies DriftResult }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Failed to detect drift'
          return {
            name: appConfig.name,
            result: {
              status: 'error' as const,
              drifted: false,
              resources: [],
              error: message } satisfies DriftResult }
        }
      })

      const settled = await Promise.all(promises)
      if (cancelled) return

      for (const { name, result } of settled) {
        results.set(name, result)
      }

      setDriftResults(results)
      setIsDetecting(false)
    }

    detectAllDriftRef.current = detectAllDrift
    detectAllDrift()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deduplicatedClusters])

  const handleSync = (app: GitOpsApp) => {
    setSyncDialogApp(app)
  }

  const handleSyncComplete = () => {
    if (syncDialogApp) {
      setSyncedApps(prev => new Set(prev).add(syncDialogApp.name))
      setDriftResults(prev => {
        const updated = new Map(prev)
        updated.set(syncDialogApp.name, { status: 'ok', drifted: false, resources: [] })
        return updated
      })
      setSyncedAt(prev => {
        const updated = new Map(prev)
        updated.set(syncDialogApp.name, new Date().toISOString())
        return updated
      })
      showToast(`${syncDialogApp.name} synced successfully!`, 'success')
    }
  }

  const apps = useMemo(() => {
    const configs = getGitOpsAppConfigs().map(c => {
      const resolved = resolveAppCluster(c.cluster)
      return { ...c, cluster: resolved.cluster, clusterAmbiguous: resolved.ambiguous }
    })
    return configs.map((config): GitOpsApp => {
      const realSyncTime = syncedAt.get(config.name)
      if (syncedApps.has(config.name)) {
        return { ...config, syncStatus: 'synced', healthStatus: 'healthy', lastSyncTime: realSyncTime, lastSyncTimeAgo: getTimeAgo(realSyncTime, t), driftDetails: undefined }
      }
      if (isDetecting) {
        return { ...config, syncStatus: 'checking', healthStatus: 'progressing', lastSyncTime: undefined, lastSyncTimeAgo: getTimeAgo(undefined, t), driftDetails: undefined }
      }
      const drift = driftResults.get(config.name)
      if (drift) {
        if (drift.status === 'error') {
          return {
            ...config,
            syncStatus: 'error',
            healthStatus: 'unknown',
            lastSyncTime: undefined,
            lastSyncTimeAgo: getTimeAgo(undefined, t),
            driftDetails: drift.error ? [drift.error] : ['Failed to detect drift'] }
        }
        const driftDetails = drift.resources.length > 0
          ? drift.resources.map(r => `${r.kind}/${r.name}: ${r.field || 'modified'}`)
          : undefined
        return {
          ...config,
          syncStatus: drift.drifted ? 'out-of-sync' : 'synced',
          healthStatus: drift.drifted ? 'progressing' : 'healthy',
          lastSyncTime: realSyncTime,
          lastSyncTimeAgo: getTimeAgo(realSyncTime, t),
          driftDetails }
      }
      return { ...config, syncStatus: 'unknown', healthStatus: 'missing', lastSyncTime: undefined, lastSyncTimeAgo: getTimeAgo(undefined, t), driftDetails: undefined }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driftResults, isDetecting, syncedApps, syncedAt, clusters])

  const filteredApps = apps
    .map(app => syncedApps.has(app.name)
      ? { ...app, syncStatus: 'synced' as const, healthStatus: 'healthy' as const, driftDetails: undefined }
      : app)
    .filter(app => {
      if (selectedCluster && app.cluster !== selectedCluster) return false
      if (statusFilter === 'synced' && app.syncStatus !== 'synced') return false
      if (statusFilter === 'drifted' && app.syncStatus !== 'out-of-sync') return false
      return true
    })

  const stats = {
    total: apps.length,
    synced: apps.filter(a => a.syncStatus === 'synced').length,
    drifted: apps.filter(a => a.syncStatus === 'out-of-sync').length,
    healthy: apps.filter(a => a.healthStatus === 'healthy').length,
    checking: apps.filter(a => a.syncStatus === 'checking').length }

  useEffect(() => {
    if (helmReleases.length > 0) cachedHelmCount.current = helmReleases.length
  }, [helmReleases.length])
  const helmCount = helmReleases.length > 0 ? helmReleases.length : cachedHelmCount.current

  const syncStatusColor = (status: string) => {
    switch (status) {
      case 'synced': return 'text-green-400 bg-green-500/20'
      case 'out-of-sync': return 'text-yellow-400 bg-yellow-500/20'
      case 'checking': return 'text-blue-400 bg-blue-500/20'
      case 'error': return 'text-red-400 bg-red-500/20'
      default: return 'text-muted-foreground bg-card'
    }
  }

  const syncStatusLabel = (status: string) => {
    switch (status) {
      case 'synced': return t('gitops.synced')
      case 'out-of-sync': return t('gitops.outOfSync')
      case 'checking': return t('gitops.checking')
      case 'error': return t('gitops.driftCheckFailed')
      default: return t('gitops.unknown')
    }
  }

  const healthStatusIndicator = (status: string): 'healthy' | 'warning' | 'error' => {
    switch (status) {
      case 'healthy': return 'healthy'
      case 'progressing': return 'warning'
      case 'unknown': return 'warning'
      default: return 'error'
    }
  }

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'total': return { value: stats.total, sublabel: t('gitops.appsConfigured'), onClick: () => drillToAllHelm(), isClickable: stats.total > 0 }
      case 'helm': return { value: helmCount, sublabel: t('gitops.helmReleases'), onClick: () => drillToAllHelm(), isClickable: helmCount > 0 }
      case 'kustomize': return { value: 0, sublabel: t('gitops.kustomizeApps'), isClickable: false }
      case 'operators': return { value: operatorSubs.length, sublabel: t('gitops.operators'), onClick: () => drillToAllOperators(), isClickable: operatorSubs.length > 0 }
      case 'deployed': return { value: stats.synced, sublabel: t('gitops.synced'), onClick: () => drillToAllHelm('synced'), isClickable: stats.synced > 0 }
      case 'failed': return { value: stats.drifted, sublabel: t('gitops.drifted'), onClick: () => drillToAllHelm('drifted'), isClickable: stats.drifted > 0 }
      case 'pending': return { value: stats.checking, sublabel: t('gitops.checking'), isClickable: false }
      case 'other': return { value: stats.healthy, sublabel: t('gitops.healthy'), onClick: () => drillToAllHelm('healthy'), isClickable: stats.healthy > 0 }
      default: return { value: 0 }
    }
  }

  return {
    t,
    clusters,
    apps,
    filteredApps,
    stats,
    dataRefreshing,
    lastUpdated,
    selectedCluster,
    setSelectedCluster,
    statusFilter,
    setStatusFilter,
    syncDialogApp,
    setSyncDialogApp,
    syncStatusColor,
    syncStatusLabel,
    healthStatusIndicator,
    getDashboardStatValue,
    handleRefresh,
    handleSync,
    handleSyncComplete,
  }
}
