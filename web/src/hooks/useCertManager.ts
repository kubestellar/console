import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useClusters } from './useMCP'
import { kubectlProxy } from '../lib/kubectlProxy'
import { getDemoMode } from './useDemoMode'

// Refresh interval for automatic polling (2 minutes)
const REFRESH_INTERVAL_MS = 120000

// Days before expiration to consider "expiring soon"
const EXPIRING_SOON_DAYS = 30

export interface Certificate {
  id: string
  name: string
  namespace: string
  cluster: string
  dnsNames: string[]
  issuerName: string
  issuerKind: 'Issuer' | 'ClusterIssuer'
  secretName: string
  status: 'ready' | 'pending' | 'failed' | 'expiring' | 'expired'
  notBefore?: Date
  notAfter?: Date
  renewalTime?: Date
  message?: string
}

export interface Issuer {
  id: string
  name: string
  namespace?: string // undefined for ClusterIssuers
  cluster: string
  kind: 'Issuer' | 'ClusterIssuer'
  type: 'ACME' | 'CA' | 'SelfSigned' | 'Vault' | 'Venafi' | 'Other'
  status: 'ready' | 'not-ready' | 'unknown'
  certificateCount: number
}

export interface CertManagerStatus {
  installed: boolean
  totalCertificates: number
  validCertificates: number
  expiringSoon: number
  expired: number
  pending: number
  failed: number
  issuers: Issuer[]
  recentRenewals: number // renewals in last 24h
}

interface CertificateResource {
  metadata: {
    name: string
    namespace: string
    creationTimestamp?: string
  }
  spec: {
    dnsNames?: string[]
    issuerRef: {
      name: string
      kind?: string
    }
    secretName?: string
    duration?: string
    renewBefore?: string
  }
  status?: {
    conditions?: Array<{
      type: string
      status: string
      reason?: string
      message?: string
      lastTransitionTime?: string
    }>
    notBefore?: string
    notAfter?: string
    renewalTime?: string
  }
}

interface IssuerResource {
  metadata: {
    name: string
    namespace?: string
  }
  spec: {
    acme?: object
    ca?: object
    selfSigned?: object
    vault?: object
    venafi?: object
  }
  status?: {
    conditions?: Array<{
      type: string
      status: string
    }>
  }
}

function detectIssuerType(spec: IssuerResource['spec']): Issuer['type'] {
  if (spec.acme) return 'ACME'
  if (spec.ca) return 'CA'
  if (spec.selfSigned) return 'SelfSigned'
  if (spec.vault) return 'Vault'
  if (spec.venafi) return 'Venafi'
  return 'Other'
}

function getCertificateStatus(cert: CertificateResource): Certificate['status'] {
  const conditions = cert.status?.conditions || []
  const readyCondition = conditions.find(c => c.type === 'Ready')

  if (!readyCondition) return 'pending'

  if (readyCondition.status === 'True') {
    // Check expiration
    const notAfter = cert.status?.notAfter ? new Date(cert.status.notAfter) : null
    if (notAfter) {
      const now = new Date()
      if (notAfter < now) return 'expired'

      const daysUntilExpiry = (notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      if (daysUntilExpiry <= EXPIRING_SOON_DAYS) return 'expiring'
    }
    return 'ready'
  }

  if (readyCondition.reason === 'Failed' || readyCondition.reason === 'Error') {
    return 'failed'
  }

  return 'pending'
}

function getIssuerStatus(issuer: IssuerResource): Issuer['status'] {
  const conditions = issuer.status?.conditions || []
  const readyCondition = conditions.find(c => c.type === 'Ready')

  if (!readyCondition) return 'unknown'
  return readyCondition.status === 'True' ? 'ready' : 'not-ready'
}

/**
 * Hook to fetch cert-manager data from clusters
 */
export function useCertManager() {
  const { clusters: allClusters } = useClusters()
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [issuers, setIssuers] = useState<Issuer[]>([])
  const [installed, setInstalled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const initialLoadDone = useRef(false)

  // Filter to reachable clusters
  const clusters = useMemo(() =>
    allClusters.filter(c => c.reachable !== false).map(c => c.name),
    [allClusters]
  )

  const refetch = useCallback(async (silent = false) => {
    if (clusters.length === 0) {
      setIsLoading(false)
      return
    }

    // In demo mode, skip fetching and return demo data
    if (getDemoMode()) {
      const demoIssuers: Issuer[] = [
        { id: 'kind-local/letsencrypt-prod', name: 'letsencrypt-prod', cluster: 'kind-local', kind: 'ClusterIssuer', type: 'ACME', status: 'ready', certificateCount: 3 },
        { id: 'eks-prod-us-east-1/vault-issuer', name: 'vault-issuer', namespace: 'cert-manager', cluster: 'eks-prod-us-east-1', kind: 'Issuer', type: 'Vault', status: 'ready', certificateCount: 12 },
        { id: 'gke-staging/selfsigned', name: 'selfsigned', cluster: 'gke-staging', kind: 'ClusterIssuer', type: 'SelfSigned', status: 'ready', certificateCount: 5 },
      ]
      const demoCertificates: Certificate[] = [
        { id: 'kind-local/default/api-cert', name: 'api-cert', namespace: 'default', cluster: 'kind-local', dnsNames: ['api.example.com'], issuerName: 'letsencrypt-prod', issuerKind: 'ClusterIssuer', secretName: 'api-cert-tls', status: 'ready', notAfter: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
        { id: 'kind-local/default/web-cert', name: 'web-cert', namespace: 'default', cluster: 'kind-local', dnsNames: ['www.example.com'], issuerName: 'letsencrypt-prod', issuerKind: 'ClusterIssuer', secretName: 'web-cert-tls', status: 'expiring', notAfter: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) },
        { id: 'eks-prod-us-east-1/prod/service-cert', name: 'service-cert', namespace: 'prod', cluster: 'eks-prod-us-east-1', dnsNames: ['service.internal'], issuerName: 'vault-issuer', issuerKind: 'Issuer', secretName: 'service-cert-tls', status: 'ready', notAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
      ]
      setCertificates(demoCertificates)
      setIssuers(demoIssuers)
      setInstalled(true)
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      initialLoadDone.current = true
      return
    }

    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) {
        setIsLoading(true)
      }
    }

    const allCertificates: Certificate[] = []
    const allIssuers: Issuer[] = []
    let certManagerFound = false

    try {
      for (const cluster of clusters) {
        try {
          // First check if cert-manager CRD exists
          const crdCheck = await kubectlProxy.exec(
            ['get', 'crd', 'certificates.cert-manager.io', '-o', 'name'],
            { context: cluster, timeout: 5000 }
          )

          if (crdCheck.exitCode !== 0) {
            // cert-manager not installed on this cluster
            continue
          }

          certManagerFound = true

          // Fetch Certificates
          const certResponse = await kubectlProxy.exec(
            ['get', 'certificates', '-A', '-o', 'json'],
            { context: cluster, timeout: 15000 }
          )

          if (certResponse.exitCode === 0 && certResponse.output) {
            const data = JSON.parse(certResponse.output)
            const items = (data.items || []) as CertificateResource[]

            for (const cert of items) {
              const status = getCertificateStatus(cert)
              allCertificates.push({
                id: `${cluster}/${cert.metadata.namespace}/${cert.metadata.name}`,
                name: cert.metadata.name,
                namespace: cert.metadata.namespace,
                cluster,
                dnsNames: cert.spec.dnsNames || [],
                issuerName: cert.spec.issuerRef.name,
                issuerKind: (cert.spec.issuerRef.kind || 'Issuer') as 'Issuer' | 'ClusterIssuer',
                secretName: cert.spec.secretName || cert.metadata.name,
                status,
                notBefore: cert.status?.notBefore ? new Date(cert.status.notBefore) : undefined,
                notAfter: cert.status?.notAfter ? new Date(cert.status.notAfter) : undefined,
                renewalTime: cert.status?.renewalTime ? new Date(cert.status.renewalTime) : undefined,
                message: cert.status?.conditions?.find(c => c.type === 'Ready')?.message,
              })
            }
          }

          // Fetch Issuers
          const issuerResponse = await kubectlProxy.exec(
            ['get', 'issuers', '-A', '-o', 'json'],
            { context: cluster, timeout: 10000 }
          )

          if (issuerResponse.exitCode === 0 && issuerResponse.output) {
            const data = JSON.parse(issuerResponse.output)
            const items = (data.items || []) as IssuerResource[]

            for (const issuer of items) {
              allIssuers.push({
                id: `${cluster}/${issuer.metadata.namespace}/${issuer.metadata.name}`,
                name: issuer.metadata.name,
                namespace: issuer.metadata.namespace,
                cluster,
                kind: 'Issuer',
                type: detectIssuerType(issuer.spec),
                status: getIssuerStatus(issuer),
                certificateCount: 0, // Will be calculated later
              })
            }
          }

          // Fetch ClusterIssuers
          const clusterIssuerResponse = await kubectlProxy.exec(
            ['get', 'clusterissuers', '-o', 'json'],
            { context: cluster, timeout: 10000 }
          )

          if (clusterIssuerResponse.exitCode === 0 && clusterIssuerResponse.output) {
            const data = JSON.parse(clusterIssuerResponse.output)
            const items = (data.items || []) as IssuerResource[]

            for (const issuer of items) {
              allIssuers.push({
                id: `${cluster}/${issuer.metadata.name}`,
                name: issuer.metadata.name,
                namespace: undefined,
                cluster,
                kind: 'ClusterIssuer',
                type: detectIssuerType(issuer.spec),
                status: getIssuerStatus(issuer),
                certificateCount: 0,
              })
            }
          }
        } catch (err) {
          console.error(`[useCertManager] Error fetching from ${cluster}:`, err)
        }
      }

      // Calculate certificate counts per issuer
      for (const issuer of allIssuers) {
        issuer.certificateCount = allCertificates.filter(cert =>
          cert.cluster === issuer.cluster &&
          cert.issuerName === issuer.name &&
          (issuer.kind === 'ClusterIssuer' || cert.namespace === issuer.namespace)
        ).length
      }

      setCertificates(allCertificates)
      setIssuers(allIssuers)
      setInstalled(certManagerFound)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(new Date())
      initialLoadDone.current = true
    } catch (err) {
      console.error('[useCertManager] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch cert-manager data')
      setConsecutiveFailures(prev => prev + 1)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [clusters])

  // Initial load
  useEffect(() => {
    if (clusters.length > 0) {
      refetch()
    } else {
      setIsLoading(false)
    }
  }, [clusters.length]) // Only re-run when cluster list changes

  // Auto-refresh
  useEffect(() => {
    if (!installed) return

    const interval = setInterval(() => {
      refetch(true)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [installed, refetch])

  // Calculate status
  const status = useMemo((): CertManagerStatus => {
    const validCerts = certificates.filter(c => c.status === 'ready')
    const expiringSoon = certificates.filter(c => c.status === 'expiring')
    const expired = certificates.filter(c => c.status === 'expired')
    const pending = certificates.filter(c => c.status === 'pending')
    const failed = certificates.filter(c => c.status === 'failed')

    // Count recent renewals (certificates with renewalTime in last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentRenewals = certificates.filter(c =>
      c.renewalTime && c.renewalTime > oneDayAgo
    ).length

    return {
      installed,
      totalCertificates: certificates.length,
      validCertificates: validCerts.length,
      expiringSoon: expiringSoon.length,
      expired: expired.length,
      pending: pending.length,
      failed: failed.length,
      issuers,
      recentRenewals,
    }
  }, [certificates, issuers, installed])

  return {
    certificates,
    issuers,
    status,
    isLoading,
    isRefreshing,
    error,
    consecutiveFailures,
    lastRefresh,
    refetch,
    isFailed: consecutiveFailures >= 3,
  }
}
