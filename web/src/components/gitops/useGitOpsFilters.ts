import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClusterInfo } from '../../hooks/mcp/types'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { getStoredAuthToken } from '../../lib/authToken'
import { agentFetch } from '../../hooks/mcp/shared'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import { getDemoMode } from '../../hooks/useDemoMode'

interface GitOpsAppConfig {
  name: string
  namespace: string
  cluster: string
  repoUrl: string
  path: string
}

export interface GitOpsApp extends GitOpsAppConfig {
  syncStatus: 'synced' | 'out-of-sync' | 'unknown' | 'checking' | 'error'
  healthStatus: 'healthy' | 'degraded' | 'progressing' | 'missing' | 'unknown'
  clusterAmbiguous?: boolean
  lastSyncTime?: string
  driftDetails?: string[]
}

type DriftStatus = 'ok' | 'error'

interface DriftResult {
  status: DriftStatus
  drifted: boolean
  resources: Array<{
    kind: string
    name: string
    namespace: string
    field: string
    gitValue: string
    clusterValue: string
  }>
  error?: string
}

interface GitOpsStats {
  total: number
  synced: number
  drifted: number
  healthy: number
  checking: number
}

type ToastType = 'success' | 'error' | 'warning' | 'info'
type StatusFilter = 'all' | 'synced' | 'drifted'

const DRIFT_HEALTHCHECK_TIMEOUT_MS = 3000
const EXACTLY_ONE_CLUSTER = 1

function getGitOpsAppConfigs(): GitOpsAppConfig[] {
  return [
    { name: 'gatekeeper', namespace: 'gatekeeper-system', cluster: '', repoUrl: 'https://github.com/open-policy-agent/gatekeeper', path: 'deploy/' },
    { name: 'kuberay-operator', namespace: 'ray-system', cluster: '', repoUrl: 'https://github.com/ray-project/kuberay', path: 'ray-operator/config/default/' },
    { name: 'kserve', namespace: 'kserve', cluster: '', repoUrl: 'https://github.com/kserve/kserve', path: 'config/default/' },
    { name: 'gpu-operator', namespace: 'gpu-operator', cluster: '', repoUrl: 'https://github.com/NVIDIA/gpu-operator', path: 'deployments/gpu-operator/' },
  ]
}

function clusterDisplayName(cluster: ClusterInfo): string {
  return cluster.context || cluster.name.split('/').pop() || ''
}

function resolveAppCluster(preferred: string, deduplicatedClusters: ClusterInfo[]): { cluster: string; ambiguous: boolean } {
  if (preferred) return { cluster: preferred, ambiguous: false }
  if (deduplicatedClusters.length === EXACTLY_ONE_CLUSTER) {
    return { cluster: clusterDisplayName(deduplicatedClusters[0]), ambiguous: false }
  }
  return { cluster: '', ambiguous: deduplicatedClusters.length > EXACTLY_ONE_CLUSTER }
}

function buildApps({
  deduplicatedClusters,
  driftResults,
  isDetecting,
  syncedApps,
  syncedAt,
}: {
  deduplicatedClusters: ClusterInfo[]
  driftResults: Map<string, DriftResult>
  isDetecting: boolean
  syncedApps: Set<string>
  syncedAt: Map<string, string>
}): GitOpsApp[] {
  const configs = getGitOpsAppConfigs().map(config => {
    const resolved = resolveAppCluster(config.cluster, deduplicatedClusters)
    return { ...config, cluster: resolved.cluster, clusterAmbiguous: resolved.ambiguous }
  })

  return configs.map((config): GitOpsApp => {
    const realSyncTime = syncedAt.get(config.name)
    if (syncedApps.has(config.name)) {
      return {
        ...config,
        syncStatus: 'synced',
        healthStatus: 'healthy',
        lastSyncTime: realSyncTime,
        driftDetails: undefined,
      }
    }

    if (isDetecting) {
      return {
        ...config,
        syncStatus: 'checking',
        healthStatus: 'progressing',
        lastSyncTime: undefined,
        driftDetails: undefined,
      }
    }

    const drift = driftResults.get(config.name)
    if (drift) {
      if (drift.status === 'error') {
        return {
          ...config,
          syncStatus: 'error',
          healthStatus: 'unknown',
          lastSyncTime: undefined,
          driftDetails: drift.error ? [drift.error] : ['Failed to detect drift'],
        }
      }

      const driftDetails = drift.resources.length > 0
        ? drift.resources.map(resource => `${resource.kind}/${resource.name}: ${resource.field || 'modified'}`)
        : undefined

      return {
        ...config,
        syncStatus: drift.drifted ? 'out-of-sync' : 'synced',
        healthStatus: drift.drifted ? 'progressing' : 'healthy',
        lastSyncTime: realSyncTime,
        driftDetails,
      }
    }

    return {
      ...config,
      syncStatus: 'unknown',
      healthStatus: 'missing',
      lastSyncTime: undefined,
      driftDetails: undefined,
    }
  })
}

function filterApps({ apps, selectedCluster, statusFilter, syncedApps }: {
  apps: GitOpsApp[]
  selectedCluster: string
  statusFilter: StatusFilter
  syncedApps: Set<string>
}): GitOpsApp[] {
  return apps
    .map(app => syncedApps.has(app.name)
      ? { ...app, syncStatus: 'synced' as const, healthStatus: 'healthy' as const, driftDetails: undefined }
      : app)
    .filter(app => {
      if (selectedCluster && app.cluster !== selectedCluster) return false
      if (statusFilter === 'synced' && app.syncStatus !== 'synced') return false
      if (statusFilter === 'drifted' && app.syncStatus !== 'out-of-sync') return false
      return true
    })
}

function buildStats(apps: GitOpsApp[]): GitOpsStats {
  return {
    total: apps.length,
    synced: apps.filter(app => app.syncStatus === 'synced').length,
    drifted: apps.filter(app => app.syncStatus === 'out-of-sync').length,
    healthy: apps.filter(app => app.healthStatus === 'healthy').length,
    checking: apps.filter(app => app.syncStatus === 'checking').length,
  }
}

interface UseGitOpsFiltersParams {
  deduplicatedClusters: ClusterInfo[]
  refetch: () => void
  showToast: (message: string, type?: ToastType) => void
}

export function useGitOpsFilters({ deduplicatedClusters, refetch, showToast }: UseGitOpsFiltersParams) {
  const [selectedCluster, setSelectedCluster] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [syncedApps, setSyncedApps] = useState<Set<string>>(new Set())
  const [syncDialogApp, setSyncDialogApp] = useState<GitOpsApp | null>(null)
  const [driftResults, setDriftResults] = useState<Map<string, DriftResult>>(new Map())
  const [isDetecting, setIsDetecting] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [syncedAt, setSyncedAt] = useState<Map<string, string>>(new Map())
  const detectAllDriftRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

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
      const configs = getGitOpsAppConfigs().map(config => {
        const resolved = resolveAppCluster(config.cluster, deduplicatedClusters)
        return { ...config, cluster: resolved.cluster, clusterAmbiguous: resolved.ambiguous }
      })

      const token = await getStoredAuthToken()
      const agentAuthHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      }
      if (token) agentAuthHeaders.Authorization = `Bearer ${token}`

      const promises = configs.map(async (appConfig) => {
        try {
          const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/gitops/detect-drift`, {
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

          if (!response.ok) {
            const errBody = await response.json().catch(() => ({})) as { error?: string }
            throw new Error(errBody.error || `detect-drift failed (HTTP ${response.status})`)
          }

          const data = (await response.json()) as {
            drifted: boolean
            resources: DriftResult['resources']
          }

          return {
            name: appConfig.name,
            result: {
              status: 'ok' as const,
              drifted: data.drifted,
              resources: data.resources || [],
            } satisfies DriftResult,
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to detect drift'
          return {
            name: appConfig.name,
            result: {
              status: 'error' as const,
              drifted: false,
              resources: [],
              error: message,
            } satisfies DriftResult,
          }
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
    void detectAllDrift()

    return () => {
      cancelled = true
    }
  }, [deduplicatedClusters])

  const apps = useMemo(() => buildApps({
    deduplicatedClusters,
    driftResults,
    isDetecting,
    syncedApps,
    syncedAt,
  }), [deduplicatedClusters, driftResults, isDetecting, syncedApps, syncedAt])

  const filteredApps = useMemo(() => filterApps({
    apps,
    selectedCluster,
    statusFilter,
    syncedApps,
  }), [apps, selectedCluster, statusFilter, syncedApps])

  const stats = useMemo(() => buildStats(apps), [apps])

  const handleRefresh = () => {
    refetch()
    void detectAllDriftRef.current()
    setLastUpdated(new Date())
  }

  const handleSyncComplete = () => {
    if (!syncDialogApp) return

    setSyncedApps(previous => new Set(previous).add(syncDialogApp.name))
    setDriftResults(previous => {
      const updated = new Map(previous)
      updated.set(syncDialogApp.name, { status: 'ok', drifted: false, resources: [] })
      return updated
    })
    setSyncedAt(previous => {
      const updated = new Map(previous)
      updated.set(syncDialogApp.name, new Date().toISOString())
      return updated
    })
    showToast(`${syncDialogApp.name} synced successfully!`, 'success')
  }

  return {
    apps,
    filteredApps,
    stats,
    selectedCluster,
    setSelectedCluster,
    statusFilter,
    setStatusFilter,
    syncDialogApp,
    setSyncDialogApp,
    isDetecting,
    lastUpdated,
    handleRefresh,
    handleSyncComplete,
  }
}
