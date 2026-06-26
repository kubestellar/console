import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { CheckCircle2, AlertTriangle, Clock, AlertCircle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { KUBECTL_DEFAULT_TIMEOUT_MS, METRICS_SERVER_TIMEOUT_MS, DEFAULT_REFRESH_INTERVAL_MS } from '../../lib/constants/network'

interface CardConfig {
  config?: Record<string, unknown>
}

interface ESOStatus {
  installed: boolean
  totalStores: number
  totalExternalSecrets: number
  synced: number
  failed: number
  pending: number
}

const DEMO_ESO: ESOStatus = {
  installed: false,
  totalStores: 0,
  totalExternalSecrets: 0,
  synced: 0,
  failed: 0,
  pending: 0,
}

export function ExternalSecrets({ config: _config }: CardConfig) {
  const { t } = useTranslation()
  const { isDemoMode } = useDemoMode()
  const { deduplicatedClusters: allClusters } = useClusters()
  const [esoStatus, setEsoStatus] = useState<ESOStatus>(DEMO_ESO)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const fetchInProgress = useRef(false)
  const initialLoadDone = useRef(false)

  const clusters = useMemo(() =>
    allClusters.filter(c => c.reachable === true),
    [allClusters]
  )

  const refetch = useCallback(async () => {
    if (isDemoMode || clusters.length === 0 || fetchInProgress.current) return
    fetchInProgress.current = true

    if (initialLoadDone.current) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    let found = false
    let stores = 0
    let totalES = 0
    let synced = 0
    let failed = 0
    let pending = 0
    let anyError = false
    let successCount = 0

    for (const cluster of clusters) {
      try {
        const crdCheck = await kubectlProxy.exec(
          ['get', 'crd', 'externalsecrets.external-secrets.io', '-o', 'name'],
          { context: cluster.name, timeout: METRICS_SERVER_TIMEOUT_MS }
        )
        successCount++
        if (crdCheck.exitCode !== 0) continue
        found = true

        const storesResult = await kubectlProxy.exec(
          ['get', 'secretstores,clustersecretstores', '-A', '-o', 'jsonpath={range .items[*]}1{end}'],
          { context: cluster.name, timeout: KUBECTL_DEFAULT_TIMEOUT_MS }
        )
        if (storesResult.exitCode === 0 && storesResult.output) {
          stores += storesResult.output.length
        }

        const esResult = await kubectlProxy.exec(
          ['get', 'externalsecrets', '-A', '-o', 'json'],
          { context: cluster.name, timeout: KUBECTL_DEFAULT_TIMEOUT_MS }
        )
        if (esResult.exitCode === 0 && esResult.output) {
          const data = JSON.parse(esResult.output)
          const items = data.items || []
          totalES += items.length
          for (const item of items) {
            const conditions = item.status?.conditions || []
            const readyCondition = conditions.find((c: { type: string }) => c.type === 'Ready')
            if (readyCondition?.status === 'True') synced++
            else if (readyCondition?.reason === 'SecretSyncedError') failed++
            else pending++
          }
        }
      } catch {
        anyError = true
      }
    }

    if (anyError && successCount === 0) {
      setFetchError(true)
      setConsecutiveFailures(prev => prev + 1)
    } else {
      setEsoStatus({ installed: found, totalStores: stores, totalExternalSecrets: totalES, synced, failed, pending })
      setFetchError(false)
      setConsecutiveFailures(0)
    }
    setIsLoading(false)
    setIsRefreshing(false)
    initialLoadDone.current = true
    fetchInProgress.current = false
  }, [clusters, isDemoMode])

  useEffect(() => {
    if (isDemoMode || clusters.length === 0) {
      setEsoStatus(DEMO_ESO)
      setIsLoading(false)
      setFetchError(false)
      setConsecutiveFailures(0)
      return
    }
    refetch()
  }, [clusters, isDemoMode, refetch])

  useEffect(() => {
    if (isDemoMode || clusters.length === 0) return
    const interval = setInterval(() => refetch(), DEFAULT_REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isDemoMode, clusters.length, refetch])

  const isFailed = consecutiveFailures >= 3

  useCardLoadingState({
    isLoading: isLoading && !esoStatus.installed,
    isRefreshing,
    hasAnyData: true,
    isDemoData: isDemoMode,
    isFailed,
    consecutiveFailures,
  })

  if (fetchError && !isDemoMode) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs" role="alert">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">Failed to fetch ESO status</p>
            <p className="text-muted-foreground">
              Check cluster connectivity.{" "}
              <button onClick={() => refetch()} className="text-red-400 hover:underline">
                Retry →
              </button>
            </p>
          </div>
        </div>
        {isFailed && (
          <p className="text-xs text-red-400/70 text-center">
            {consecutiveFailures} consecutive failures
          </p>
        )}
      </div>
    )
  }

  if (!isLoading && !esoStatus.installed) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-400 font-medium">External Secrets Integration</p>
            <p className="text-muted-foreground">
              Install ESO for secrets synchronization.{" "}
              <a
                href="https://external-secrets.io/latest/introduction/getting-started/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                Install guide →
              </a>
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center py-4">
          {clusters.length > 0
            ? `Scanned ${clusters.length} cluster${clusters.length !== 1 ? 's' : ''} — no ESO installation detected`
            : 'No clusters connected'}
        </p>
      </div>
    )
  }

  const syncRate = esoStatus.totalExternalSecrets > 0
    ? Math.round((esoStatus.synced / esoStatus.totalExternalSecrets) * 100)
    : 100

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <span className="text-xs text-green-400 font-medium">{syncRate}% synced</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${syncRate}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 text-center text-xs">
        <div className="p-2 rounded-lg bg-green-500/10">
          <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto mb-1" />
          <p className="font-medium text-foreground">{esoStatus.synced}</p>
          <p className="text-muted-foreground">Synced</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10">
          <AlertTriangle className="w-4 h-4 text-red-400 mx-auto mb-1" />
          <p className="font-medium text-foreground">{esoStatus.failed}</p>
          <p className="text-muted-foreground">{t('common.failed')}</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10">
          <Clock className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
          <p className="font-medium text-foreground">{esoStatus.pending}</p>
          <p className="text-muted-foreground">{t('common.pending')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
        <span className="text-muted-foreground">Secret Stores</span>
        <span className="font-medium text-foreground">{esoStatus.totalStores}</span>
      </div>
    </div>
  )
}
