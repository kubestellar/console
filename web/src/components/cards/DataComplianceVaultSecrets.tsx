import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { AlertTriangle, AlertCircle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { KUBECTL_DEFAULT_TIMEOUT_MS, DEFAULT_REFRESH_INTERVAL_MS } from '../../lib/constants/network'

interface CardConfig {
  config?: Record<string, unknown>
}

interface VaultStatus {
  installed: boolean
  podCount: number
  readyPods: number
  sealedStatus: 'unsealed' | 'sealed' | 'unknown'
  version?: string
}

const DEMO_VAULT: VaultStatus = {
  installed: false,
  podCount: 0,
  readyPods: 0,
  sealedStatus: 'unknown',
}

export function VaultSecrets({ config: _config }: CardConfig) {
  const { t } = useTranslation()
  const { isDemoMode } = useDemoMode()
  const { deduplicatedClusters: allClusters } = useClusters()
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>(DEMO_VAULT)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [secretCount, setSecretCount] = useState(0)
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
    let totalPods = 0
    let readyPods = 0
    let secrets = 0
    let anyError = false
    let successCount = 0

    for (const cluster of clusters) {
      try {
        const podsResult = await kubectlProxy.exec(
          ['get', 'pods', '-A', '-l', 'app.kubernetes.io/name=vault', '-o', 'json'],
          { context: cluster.name, timeout: KUBECTL_DEFAULT_TIMEOUT_MS }
        )
        successCount++
        if (podsResult.exitCode === 0 && podsResult.output) {
          const data = JSON.parse(podsResult.output)
          const items = data.items || []
          if (items.length > 0) {
            found = true
            totalPods += items.length
            readyPods += items.filter((p: { status?: { phase?: string } }) =>
              p.status?.phase === 'Running'
            ).length
          }
        }

        const secretsResult = await kubectlProxy.exec(
          ['get', 'secrets', '-A', '-o', 'jsonpath={range .items[?(@.type=="Opaque")]}1{end}'],
          { context: cluster.name, timeout: KUBECTL_DEFAULT_TIMEOUT_MS }
        )
        if (secretsResult.exitCode === 0 && secretsResult.output) {
          secrets += secretsResult.output.length
        }
      } catch {
        anyError = true
      }
    }

    if (anyError && successCount === 0) {
      setFetchError(true)
      setConsecutiveFailures(prev => prev + 1)
    } else {
      setVaultStatus({
        installed: found,
        podCount: totalPods,
        readyPods,
        sealedStatus: found ? (readyPods > 0 ? 'unsealed' : 'sealed') : 'unknown',
      })
      setSecretCount(secrets)
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
      setVaultStatus(DEMO_VAULT)
      setSecretCount(0)
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
    isLoading: isLoading && !vaultStatus.installed,
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
            <p className="text-red-400 font-medium">Failed to fetch Vault status</p>
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

  if (!isLoading && !vaultStatus.installed) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 font-medium">Vault Integration</p>
            <p className="text-muted-foreground">
              Install Vault for secrets management.{" "}
              <a
                href="https://developer.hashicorp.com/vault/docs/platform/k8s"
                target="_blank"
                rel="noopener noreferrer"
                className="text-yellow-400 hover:underline"
              >
                Install guide →
              </a>
            </p>
          </div>
        </div>

        {secretCount > 0 && (
          <div className="grid grid-cols-1 gap-2">
            <div className="p-2 rounded-lg bg-secondary/30 text-center">
              <p className="text-lg font-bold text-foreground">{secretCount}</p>
              <p className="text-xs text-muted-foreground">Opaque {t('drilldown.tabs.secrets')} (unmanaged)</p>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center py-2">
          {clusters.length > 0
            ? `Scanned ${clusters.length} cluster${clusters.length !== 1 ? 's' : ''} — no Vault installation detected`
            : 'No clusters connected'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          vaultStatus.sealedStatus === 'unsealed'
            ? 'bg-green-500/20 text-green-400'
            : 'bg-red-500/20 text-red-400'
        }`}>
          {vaultStatus.sealedStatus}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-foreground">{secretCount}</p>
          <p className="text-xs text-muted-foreground">{t('drilldown.tabs.secrets')}</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-foreground">{vaultStatus.readyPods}/{vaultStatus.podCount}</p>
          <p className="text-xs text-muted-foreground">Vault Pods Ready</p>
        </div>
      </div>
    </div>
  )
}
