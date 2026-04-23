/**
 * Cards for open source data compliance tools:
 * - HashiCorp Vault: Secrets management and encryption
 * - External Secrets Operator: Kubernetes secrets synchronization
 * - Cert-Manager: TLS certificate lifecycle management
 */

import { useState, useEffect, useMemo } from 'react'
import { Shield, CheckCircle2, AlertTriangle, Clock, AlertCircle } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { useCertManager } from '../../hooks/useCertManager'
import { useClusters } from '../../hooks/useMCP'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

interface CardConfig {
  config?: Record<string, unknown>
}

// ── Vault Secrets Card ────────────────────────────────────────────────────

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

// HashiCorp Vault - Secrets Management Card
export function VaultSecrets({ config: _config }: CardConfig) {
  const { t } = useTranslation()
  const { isDemoMode } = useDemoMode()
  const { clusters: allClusters } = useClusters()
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>(DEMO_VAULT)
  const [isLoading, setIsLoading] = useState(true)
  const [secretCount, setSecretCount] = useState(0)

  const clusters = useMemo(() =>
    allClusters.filter(c => c.reachable === true),
    [allClusters]
  )

  useEffect(() => {
    if (isDemoMode || clusters.length === 0) {
      setVaultStatus(DEMO_VAULT)
      setSecretCount(0)
      setIsLoading(false)
      return
    }

    let cancelled = false
    async function detect() {
      setIsLoading(true)
      let found = false
      let totalPods = 0
      let readyPods = 0
      let secrets = 0

      for (const cluster of clusters) {
        try {
          // Check for Vault pods (helm release or operator)
          const podsResult = await kubectlProxy.exec(
            ['get', 'pods', '-A', '-l', 'app.kubernetes.io/name=vault', '-o', 'json'],
            { context: cluster.name, timeout: 10000 }
          )
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

          // Count opaque secrets (user-managed) in this cluster
          const secretsResult = await kubectlProxy.exec(
            ['get', 'secrets', '-A', '-o', 'jsonpath={range .items[?(@.type=="Opaque")]}1{end}'],
            { context: cluster.name, timeout: 10000 }
          )
          if (secretsResult.exitCode === 0 && secretsResult.output) {
            secrets += secretsResult.output.length
          }
        } catch {
          // Continue to next cluster
        }
      }

      if (!cancelled) {
        setVaultStatus({
          installed: found,
          podCount: totalPods,
          readyPods,
          sealedStatus: found ? (readyPods > 0 ? 'unsealed' : 'sealed') : 'unknown',
        })
        setSecretCount(secrets)
        setIsLoading(false)
      }
    }

    detect()
    return () => { cancelled = true }
  }, [clusters, isDemoMode])

  useCardLoadingState({
    isLoading: isLoading && !vaultStatus.installed,
    hasAnyData: true,
    isDemoData: isDemoMode,
  })

  // Vault not detected — show install notice with real secret count
  if (!isLoading && !vaultStatus.installed) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 font-medium">Vault Integration</p>
            <p className="text-muted-foreground">
              Install Vault for secrets management.{' '}
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

  // Vault is installed — show real status
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

// ── External Secrets Card ─────────────────────────────────────────────────

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

// External Secrets Operator Card
export function ExternalSecrets({ config: _config }: CardConfig) {
  const { t } = useTranslation()
  const { isDemoMode } = useDemoMode()
  const { clusters: allClusters } = useClusters()
  const [esoStatus, setEsoStatus] = useState<ESOStatus>(DEMO_ESO)
  const [isLoading, setIsLoading] = useState(true)

  const clusters = useMemo(() =>
    allClusters.filter(c => c.reachable === true),
    [allClusters]
  )

  useEffect(() => {
    if (isDemoMode || clusters.length === 0) {
      setEsoStatus(DEMO_ESO)
      setIsLoading(false)
      return
    }

    let cancelled = false
    async function detect() {
      setIsLoading(true)
      let found = false
      let stores = 0
      let totalES = 0
      let synced = 0
      let failed = 0
      let pending = 0

      for (const cluster of clusters) {
        try {
          // Check if ESO CRD exists
          const crdCheck = await kubectlProxy.exec(
            ['get', 'crd', 'externalsecrets.external-secrets.io', '-o', 'name'],
            { context: cluster.name, timeout: 5000 }
          )
          if (crdCheck.exitCode !== 0) continue
          found = true

          // Count SecretStores + ClusterSecretStores
          const storesResult = await kubectlProxy.exec(
            ['get', 'secretstores,clustersecretstores', '-A', '-o', 'jsonpath={range .items[*]}1{end}'],
            { context: cluster.name, timeout: 10000 }
          )
          if (storesResult.exitCode === 0 && storesResult.output) {
            stores += storesResult.output.length
          }

          // Count ExternalSecrets with status
          const esResult = await kubectlProxy.exec(
            ['get', 'externalsecrets', '-A', '-o', 'json'],
            { context: cluster.name, timeout: 10000 }
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
          // Continue to next cluster
        }
      }

      if (!cancelled) {
        setEsoStatus({ installed: found, totalStores: stores, totalExternalSecrets: totalES, synced, failed, pending })
        setIsLoading(false)
      }
    }

    detect()
    return () => { cancelled = true }
  }, [clusters, isDemoMode])

  useCardLoadingState({
    isLoading: isLoading && !esoStatus.installed,
    hasAnyData: true,
    isDemoData: isDemoMode,
  })

  // ESO not detected
  if (!isLoading && !esoStatus.installed) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-400 font-medium">External Secrets Integration</p>
            <p className="text-muted-foreground">
              Install ESO for secrets synchronization.{' '}
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

  // ESO installed — show real data
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

// Cert-Manager TLS Certificates Card
export function CertManager({ config: _config }: CardConfig) {
  const { t } = useTranslation()
  const { status, issuers, isLoading, isRefreshing, consecutiveFailures, isFailed } = useCertManager()
  const hasData = issuers.length > 0 || status.installed
  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
  })

  // Show install notice if cert-manager is not detected
  if (!isLoading && !status.installed) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-green-400 font-medium">Cert-Manager Integration</p>
            <p className="text-muted-foreground">
              Install cert-manager for TLS automation.{' '}
              <a
                href="https://cert-manager.io/docs/installation/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 hover:underline"
              >
                Install guide →
              </a>
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center py-4">
          No cert-manager installation detected
        </p>
      </div>
    )
  }

  // Loading state
  if (isLoading && issuers.length === 0) {
    return (
      <div className="space-y-3">
        <div className="animate-pulse grid grid-cols-2 @md:grid-cols-4 gap-1.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-2 rounded-lg bg-secondary/30 h-16" />
          ))}
        </div>
        <div className="animate-pulse space-y-1.5">
          <div className="h-4 w-16 bg-secondary/30 rounded" />
          <div className="h-12 bg-secondary/30 rounded" />
          <div className="h-12 bg-secondary/30 rounded" />
        </div>
      </div>
    )
  }

  // Top issuers by certificate count
  const topIssuers = [...issuers]
    .sort((a, b) => b.certificateCount - a.certificateCount)
    .slice(0, 3)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <span className="text-xs text-muted-foreground">
          {status.recentRenewals} renewals/24h
        </span>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-1.5 text-center text-xs">
        <div className="p-2 rounded-lg bg-green-500/10">
          <p className="text-lg font-bold text-green-400">{status.validCertificates}</p>
          <p className="text-muted-foreground">Valid</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10">
          <p className="text-lg font-bold text-yellow-400">{status.expiringSoon}</p>
          <p className="text-muted-foreground">Expiring</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10">
          <p className="text-lg font-bold text-red-400">{status.expired}</p>
          <p className="text-muted-foreground">Expired</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30">
          <p className="text-lg font-bold text-foreground">{status.totalCertificates}</p>
          <p className="text-muted-foreground">{t('common.total')}</p>
        </div>
      </div>

      {/* Pending/Failed summary if any */}
      {(status.pending > 0 || status.failed > 0) && (
        <div className="flex items-center gap-2 text-xs">
          {status.pending > 0 && (
            <StatusBadge color="blue" rounded="full">
              {status.pending} pending
            </StatusBadge>
          )}
          {status.failed > 0 && (
            <StatusBadge color="red" rounded="full">
              {status.failed} failed
            </StatusBadge>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          Issuers ({issuers.length})
        </p>
        {topIssuers.length > 0 ? (
          topIssuers.map((issuer) => (
            <div key={issuer.id} className="flex flex-wrap items-center justify-between gap-y-2 p-2 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2">
                <Shield className={`w-3 h-3 ${
                  issuer.status === 'ready' ? 'text-green-400' :
                  issuer.status === 'not-ready' ? 'text-red-400' :
                  'text-muted-foreground'
                }`} />
                <span className="text-xs text-foreground truncate max-w-[120px]">{issuer.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted-foreground">{issuer.kind}</span>
                <span className="text-xs font-medium text-foreground">{issuer.certificateCount}</span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">
            No issuers found
          </p>
        )}
      </div>
    </div>
  )
}
