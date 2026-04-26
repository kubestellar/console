import { useMemo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useClusters, useHelmReleases, useOperatorSubscriptions } from '../../hooks/useMCP'
import { StatusIndicator } from '../charts/StatusIndicator'
import { useToast } from '../ui/Toast'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { RefreshCw, GitBranch, FolderGit, Box, Loader2 } from 'lucide-react'
import { SyncDialog } from './SyncDialog'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN } from '../../lib/constants'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import { getDemoMode } from '../../hooks/useDemoMode'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { PortalTooltip } from '../cards/llmd/shared/PortalTooltip'
import { STATUS_TOOLTIPS } from '../shared/TechnicalAcronym'
import { StatusBadge } from '../ui/StatusBadge'

// GitOps app configuration (repos to monitor)
interface GitOpsAppConfig {
  name: string
  namespace: string
  cluster: string
  repoUrl: string
  path: string
}

// GitOps app with detected status
// #6156 — 'error' is a distinct status so failed drift checks render as an
// error (not a false-positive "synced + healthy").
interface GitOpsApp extends GitOpsAppConfig {
  syncStatus: 'synced' | 'out-of-sync' | 'unknown' | 'checking' | 'error'
  healthStatus: 'healthy' | 'degraded' | 'progressing' | 'missing' | 'unknown'
  // #6157 — marks apps whose cluster could not be resolved unambiguously
  clusterAmbiguous?: boolean
  lastSyncTime?: string
  driftDetails?: string[]
}

// Drift detection result from API
// #6156 — `status` explicitly captures the outcome so the UI never treats an
// error as "not drifted". 'ok' = detection ran and returned a result; 'error'
// = detection failed (network error, backend down, parsing error, etc.).
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

const GITOPS_STORAGE_KEY = 'kubestellar-gitops-dashboard-cards'

// Default cards for the GitOps dashboard
const DEFAULT_GITOPS_CARDS = getDefaultCards('gitops')

// Apps to monitor - these could come from a config file or API
function getGitOpsAppConfigs(): GitOpsAppConfig[] {
  return [
    { name: 'gatekeeper', namespace: 'gatekeeper-system', cluster: '', repoUrl: 'https://github.com/open-policy-agent/gatekeeper', path: 'deploy/' },
    { name: 'kuberay-operator', namespace: 'ray-system', cluster: '', repoUrl: 'https://github.com/ray-project/kuberay', path: 'ray-operator/config/default/' },
    { name: 'kserve', namespace: 'kserve', cluster: '', repoUrl: 'https://github.com/kserve/kserve', path: 'config/default/' },
    { name: 'gpu-operator', namespace: 'gpu-operator', cluster: '', repoUrl: 'https://github.com/NVIDIA/gpu-operator', path: 'deployments/gpu-operator/' },
  ]
}

function getTimeAgo(timestamp: string | undefined, t: TFunction): string {
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

export function GitOps() {
  const { t } = useTranslation(['common', 'cards'])
  const { clusters, isRefreshing: dataRefreshing, refetch } = useClusters()
  const { releases: helmReleases } = useHelmReleases()
  const { subscriptions: operatorSubs } = useOperatorSubscriptions()
  const { drillToAllHelm, drillToAllOperators } = useDrillDownActions()
  const { showToast } = useToast()

  // Local state
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [syncedApps, setSyncedApps] = useState<Set<string>>(new Set())
  const [syncDialogApp, setSyncDialogApp] = useState<GitOpsApp | null>(null)
  const [driftResults, setDriftResults] = useState<Map<string, DriftResult>>(new Map())
  // #6155 — isDetecting starts `false`. The effect below flips it to `true`
  // only when a real detection pass is about to run (non-demo mode AND
  // backend healthy). Previously it defaulted to `true` and demo mode never
  // cleared it, leaving every card stuck in "checking".
  const [isDetecting, setIsDetecting] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Cache helm releases count to prevent showing 0 during refresh
  const cachedHelmCount = useRef(0)

  // Set initial lastUpdated on mount
  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  // Health-check timeout for skipping drift detection when the backend is
  // unreachable — long enough to survive a slow initial auth round-trip,
  // short enough that users don't stare at "checking" for seconds (#3609).
  const DRIFT_HEALTHCHECK_TIMEOUT_MS = 3000

  // #6157 — Cluster resolution. Previously every app with an empty preferred
  // cluster silently fell back to `clusters[0]`, making multi-cluster
  // attribution wrong (every app appeared to target the first cluster).
  //
  // New semantics:
  //   - If `preferred` is set, use it verbatim (explicit).
  //   - If there is exactly one cluster available, use it (unambiguous).
  //   - Otherwise return `{ cluster: '', ambiguous: true }` so the UI can
  //     render the entry as "cluster: unknown" instead of silently picking
  //     one. This preserves the display shape used by the <select> (context
  //     || name.split('/').pop()).
  const EXACTLY_ONE_CLUSTER = 1
  const clusterDisplayName = (c: { context?: string; name: string }): string =>
    c.context || c.name.split('/').pop() || ''
  const resolveAppCluster = (preferred: string): { cluster: string; ambiguous: boolean } => {
    if (preferred) return { cluster: preferred, ambiguous: false }
    if (clusters.length === EXACTLY_ONE_CLUSTER) {
      return { cluster: clusterDisplayName(clusters[0]), ambiguous: false }
    }
    return { cluster: '', ambiguous: clusters.length > EXACTLY_ONE_CLUSTER }
  }

  // #5952 — detectAllDrift is now a callable ref so the refresh button can
  // re-run drift detection instead of only updating lastUpdated.
  const detectAllDriftRef = useRef<() => Promise<void>>(async () => {})

  const handleRefresh = () => {
    refetch()
    // Re-run drift detection so the UI actually reflects fresh state.
    void detectAllDriftRef.current()
    setLastUpdated(new Date())
  }

  // Detect drift for all apps on mount (skip in demo mode - no backend).
  // Guard: verify backend is reachable first to avoid slow sequential failures
  // that block the UI and add latency (#3609).
  useEffect(() => {
    // #6155 — In demo mode there is no backend; ensure isDetecting is false
    // so cards do not stay stuck in the "checking" state forever. This uses
    // the SAME setter the real exit path uses, rather than silently
    // returning and leaving the previous value in place.
    if (getDemoMode()) {
      setIsDetecting(false)
      return
    }

    let cancelled = false

    async function detectAllDrift() {
      // Quick health check — skip drift detection entirely if backend is down
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

      // Run drift checks in parallel with individual timeouts instead of
      // sequential requests, reducing total latency significantly.
      // #7993 Phase 4: drift detection moved to kc-agent — calls go to the
      // local agent process running under the user's kubeconfig.
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      const agentAuthHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      }
      if (token) agentAuthHeaders['Authorization'] = `Bearer ${token}`
      const promises = configs.map(async (appConfig) => {
        try {
          const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/gitops/detect-drift`, {
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
        } catch (e) {
          // #6156 — Failed drift checks MUST NOT be coerced to
          // `drifted: false` — that rendered as "synced + healthy" (false
          // green). Return status: 'error' so the UI can render a distinct
          // error state.
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
    // resolveAppCluster depends on `clusters`, which is the effective dep here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters])

  // Handle sync action - open the sync dialog
  const handleSync = (app: GitOpsApp) => {
    setSyncDialogApp(app)
  }

  // Handle sync complete - mark app as synced and refresh drift status
  const handleSyncComplete = () => {
    if (syncDialogApp) {
      // React 18+ automatically batches these state updates
      setSyncedApps(prev => new Set(prev).add(syncDialogApp.name))
      setDriftResults(prev => {
        const updated = new Map(prev)
        updated.set(syncDialogApp.name, { status: 'ok', drifted: false, resources: [] })
        return updated
      })
      // #6158 — record the real time the sync completed; this is the ONLY
      // place a lastSyncTime should be captured.
      setSyncedAt(prev => {
        const updated = new Map(prev)
        updated.set(syncDialogApp.name, new Date().toISOString())
        return updated
      })
      showToast(`${syncDialogApp.name} synced successfully!`, 'success')
    }
  }

  // Track when the user manually triggered a sync from this session, so the
  // "last sync" timestamp is a real event (a sync that actually happened via
  // this UI) rather than a timestamp fabricated on every render. #6158
  const [syncedAt, setSyncedAt] = useState<Map<string, string>>(new Map())

  // Build apps list with real drift status
  const apps = useMemo(() => {
    // #5953 — Fill in a real cluster so the cluster filter below actually
    // matches. Without this, `app.cluster` was always "" and every app was
    // filtered out the moment a user selected a cluster.
    // #6157 — resolveAppCluster now returns { cluster, ambiguous }.
    const configs = getGitOpsAppConfigs().map(c => {
      const resolved = resolveAppCluster(c.cluster)
      return { ...c, cluster: resolved.cluster, clusterAmbiguous: resolved.ambiguous }
    })
    return configs.map((config): GitOpsApp => {
      // #6158 — lastSyncTime is ONLY set when the user actually synced via
      // SyncDialog in this session. We never fabricate a timestamp on
      // render. When unknown, the UI displays t('gitops.unknown').
      const realSyncTime = syncedAt.get(config.name)
      if (syncedApps.has(config.name)) {
        return { ...config, syncStatus: 'synced', healthStatus: 'healthy', lastSyncTime: realSyncTime, driftDetails: undefined }
      }
      if (isDetecting) {
        return { ...config, syncStatus: 'checking', healthStatus: 'progressing', lastSyncTime: undefined, driftDetails: undefined }
      }
      const drift = driftResults.get(config.name)
      if (drift) {
        // #6156 — Render failed drift checks as a distinct error state.
        if (drift.status === 'error') {
          return {
            ...config,
            syncStatus: 'error',
            healthStatus: 'unknown',
            lastSyncTime: undefined,
            driftDetails: drift.error ? [drift.error] : ['Failed to detect drift'] }
        }
        const driftDetails = drift.resources.length > 0
          ? drift.resources.map(r => `${r.kind}/${r.name}: ${r.field || 'modified'}`)
          : undefined
        return {
          ...config,
          syncStatus: drift.drifted ? 'out-of-sync' : 'synced',
          healthStatus: drift.drifted ? 'progressing' : 'healthy',
          // #6158 — do not fabricate a client-side timestamp here.
          lastSyncTime: realSyncTime,
          driftDetails }
      }
      return { ...config, syncStatus: 'unknown', healthStatus: 'missing', lastSyncTime: undefined, driftDetails: undefined }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driftResults, isDetecting, syncedApps, syncedAt, clusters])

  // #6158 — no longer regenerates lastSyncTime here. The synced overlay only
  // normalizes status fields; timestamps flow through from `apps`, which
  // reads the real sync time from the `syncedAt` map.
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
      // #6156 — distinct visual for error (red), not green.
      case 'error': return 'text-red-400 bg-red-500/20'
      default: return 'text-muted-foreground bg-card'
    }
  }

  const syncStatusLabel = (status: string) => {
    switch (status) {
      case 'synced': return t('gitops.synced')
      case 'out-of-sync': return t('gitops.outOfSync')
      case 'checking': return t('gitops.checking')
      // #6156 — distinct label for the error state (not "unknown").
      case 'error': return t('gitops.driftCheckFailed')
      default: return t('gitops.unknown')
    }
  }

  const healthStatusIndicator = (status: string): 'healthy' | 'warning' | 'error' => {
    switch (status) {
      case 'healthy': return 'healthy'
      case 'progressing': return 'warning'
      // #6156 — drift-check errors render as warning (not healthy/error
      // green), so the user knows the state is unknown, not confirmed good.
      case 'unknown': return 'warning'
      default: return 'error'
    }
  }

  // Stats value getter
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

  const getStatValue = getDashboardStatValue

  // Filters and Apps List - rendered before cards
  const filtersAndAppsList = (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm"
        >
          <option value="">{t('gitops.allClusters')}</option>
          {clusters.map((cluster) => (
            <option key={cluster.name} value={cluster.context || cluster.name.split('/').pop()}>
              {cluster.context || cluster.name.split('/').pop()}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          {([
            { value: 'all', label: t('common.all'), activeClass: 'bg-primary text-primary-foreground' },
            { value: 'synced', label: t('gitops.synced'), activeClass: 'bg-green-500 text-white' },
            { value: 'drifted', label: t('gitops.drifted'), activeClass: 'bg-yellow-500 text-white' },
          ] as const).map(({ value, label, activeClass }) => (
            <button key={value} onClick={() => setStatusFilter(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === value ? activeClass : 'bg-card/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Apps List */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-muted-foreground">{t('gitops.applications')}</span>
        <StatusBadge color="yellow" size="xs">{t('common:common.demo')}</StatusBadge>
      </div>
      {filteredApps.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🔄</div>
          <div className="text-lg text-foreground">{t('gitops.noApplications')}</div>
          <div className="text-sm text-muted-foreground">{t('gitops.configureHint')}</div>
        </div>
      ) : (
        <div className="space-y-4 mb-6 border-2 border-yellow-500/30 rounded-lg p-4">
          {filteredApps.map((app, i) => (
            <div
              key={i}
              className={`glass p-4 rounded-lg border-l-4 ${
                app.syncStatus === 'synced' ? 'border-l-green-500' :
                app.syncStatus === 'checking' ? 'border-l-blue-500' :
                app.syncStatus === 'out-of-sync' ? 'border-l-yellow-500' : 'border-l-gray-500'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <PortalTooltip content={STATUS_TOOLTIPS[healthStatusIndicator(app.healthStatus)]}>
                    <span>
                      <StatusIndicator status={healthStatusIndicator(app.healthStatus)} size="lg" />
                    </span>
                  </PortalTooltip>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{app.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${syncStatusColor(app.syncStatus)}`}>
                        {app.syncStatus === 'checking' && <Loader2 className="w-3 h-3 animate-spin" />}
                        {syncStatusLabel(app.syncStatus)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1" title={t('gitops.kubernetesNamespace')}>
                        <Box className="w-3 h-3" />
                        <span>{app.namespace}</span>
                      </span>
                      {app.cluster && (
                        <span className="flex items-center gap-1" title={t('gitops.targetCluster')}>
                          <span className="text-muted-foreground/50">→</span>
                          <span>{app.cluster}</span>
                        </span>
                      )}
                      {/* #6157 — multiple clusters exist and no explicit
                          target was configured; show "cluster: unknown"
                          instead of silently attributing to clusters[0]. */}
                      {!app.cluster && app.clusterAmbiguous && (
                        <span className="flex items-center gap-1 text-yellow-400" title={t('gitops.targetCluster')}>
                          <span className="text-muted-foreground/50">→</span>
                          <span>{t('gitops.clusterUnresolved')}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title={t('gitops.gitRepoSource')}>
                      <GitBranch className="w-3 h-3 text-purple-400" />
                      <span className="font-mono">github.com/{app.repoUrl.replace('https://github.com/', '')}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground" title={t('gitops.pathInRepo')}>
                      <FolderGit className="w-3 h-3 text-blue-400" />
                      <span className="font-mono">{app.path}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{t('gitops.lastSync')}: {getTimeAgo(app.lastSyncTime, t)}</div>
                  <div className="mt-1 capitalize">{app.healthStatus}</div>
                </div>
              </div>

              {/* Drift Details */}
              {app.driftDetails && app.driftDetails.length > 0 && (
                <div className="mt-3 p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
                  <div className="text-sm font-medium text-yellow-400 mb-2">{t('gitops.driftDetected')}</div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {app.driftDetails.map((detail, j) => (
                      <li key={j} className="flex items-center gap-2">
                        <span className="text-yellow-400">•</span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleSync(app)}
                    className="mt-2 px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 text-xs hover:bg-yellow-500/30 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {t('gitops.syncNow')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )

  return (
    <>
      <DashboardPage
        title={t('gitops.title')}
        subtitle={t('gitops.subtitle')}
        icon="GitBranch"
        rightExtra={<RotatingTip page="gitops" />}
        storageKey={GITOPS_STORAGE_KEY}
        defaultCards={DEFAULT_GITOPS_CARDS}
        statsType="gitops"
        getStatValue={getStatValue}
        onRefresh={handleRefresh}
        isLoading={false}
        isRefreshing={dataRefreshing}
        lastUpdated={lastUpdated}
        hasData={stats.total > 0}
        beforeCards={filtersAndAppsList}
        emptyState={{
          title: t('gitops.dashboardTitle'),
          description: t('gitops.dashboardDescription') }}
        isDemoData={true}
      >
        {/* Info */}
        <div className="mt-8 p-4 rounded-lg bg-card/30 border border-border">
          <h3 className="text-lg font-semibold text-foreground mb-3">{t('gitops.integrationTitle')}</h3>
          <p className="text-sm text-muted-foreground mb-3">
            {t('gitops.integrationDescription')}
          </p>
          <div className="flex gap-2">
            {([
              { key: 'argocd', label: t('gitops.configureArgoCD') },
              { key: 'flux', label: t('gitops.configureFlux') },
            ] as const).map(({ key, label }) => (
              <button key={key} className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors">
                {label}
              </button>
            ))}
          </div>
        </div>
      </DashboardPage>

      {/* Sync Dialog */}
      {syncDialogApp && (
        <SyncDialog
          isOpen={!!syncDialogApp}
          onClose={() => setSyncDialogApp(null)}
          appName={syncDialogApp.name}
          namespace={syncDialogApp.namespace}
          cluster={syncDialogApp.cluster}
          repoUrl={syncDialogApp.repoUrl}
          path={syncDialogApp.path}
          onSyncComplete={handleSyncComplete}
        />
      )}
    </>
  )
}
