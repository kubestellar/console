import { useEffect, useSyncExternalStore } from 'react'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { agentFetch } from './mcp/shared'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import { useDemoMode } from './useDemoMode'

// ============================================================================
// Types — mirrors pkg/agent/federation/types.go
// ============================================================================

export type FederationProviderName =
  | 'ocm' | 'karmada' | 'clusternet' | 'liqo' | 'kubeadmiral' | 'capi'

export type ClusterState =
  | 'joined' | 'pending' | 'unknown' | 'not-member'
  | 'provisioning' | 'provisioned' | 'failed' | 'deleting'

export type ClusterErrorType =
  | 'auth' | 'timeout' | 'network' | 'certificate' | 'not-installed' | 'unknown'

export interface FederatedCluster {
  provider: FederationProviderName
  hubContext: string
  name: string
  state: ClusterState
  available: string
  clusterSet?: string
  labels?: Record<string, string>
  apiServerURL?: string
  taints?: Array<{ key: string; value?: string; effect: string }>
  lifecycle?: {
    phase: string
    controlPlaneReady: boolean
    infrastructureReady: boolean
    desiredMachines: number
    readyMachines: number
  }
  raw?: unknown
}

export interface FederatedGroup {
  provider: FederationProviderName
  hubContext: string
  name: string
  members: string[]
  kind: 'set' | 'selector' | 'peer' | 'infra'
}

export interface PendingJoin {
  provider: FederationProviderName
  hubContext: string
  clusterName: string
  requestedAt: string
  detail?: string
}

export interface FederationError {
  provider: FederationProviderName
  hubContext: string
  type: ClusterErrorType
  message: string
}

export interface ProviderHubStatus {
  provider: FederationProviderName
  hubContext: string
  detected: boolean
  version?: string
  error?: FederationError
}

export interface FederationAwareness {
  hubs: ProviderHubStatus[]
  clusters: FederatedCluster[]
  groups: FederatedGroup[]
  pendingJoins: PendingJoin[]
  errors: readonly FederationError[]
  isDemoFallback: boolean
}

// ============================================================================
// Provider display helpers
// ============================================================================

const PROVIDER_LABELS: Record<FederationProviderName, string> = {
  ocm: 'OCM',
  karmada: 'Karmada',
  clusternet: 'Clusternet',
  liqo: 'Liqo',
  kubeadmiral: 'KubeAdmiral',
  capi: 'CAPI',
}

export function getProviderLabel(provider: FederationProviderName): string {
  return PROVIDER_LABELS[provider] || provider
}

const STATE_LABELS: Record<ClusterState, string> = {
  joined: 'Joined',
  pending: 'Pending',
  unknown: 'Unknown',
  'not-member': 'Not Member',
  provisioning: 'Provisioning',
  provisioned: 'Provisioned',
  failed: 'Failed',
  deleting: 'Deleting',
}

export function getStateLabel(state: ClusterState): string {
  return STATE_LABELS[state] || state
}

const STATE_COLORS: Record<ClusterState, string> = {
  joined: 'text-green-400 bg-green-500/15 border-green-500/25',
  pending: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/25',
  unknown: 'text-muted-foreground bg-secondary/50 border-border/30',
  'not-member': 'text-muted-foreground bg-secondary/50 border-border/30',
  provisioning: 'text-blue-400 bg-blue-500/15 border-blue-500/25',
  provisioned: 'text-green-400 bg-green-500/15 border-green-500/25',
  failed: 'text-red-400 bg-red-500/15 border-red-500/25',
  deleting: 'text-orange-400 bg-orange-500/15 border-orange-500/25',
}

export function getStateColorClasses(state: ClusterState): string {
  return STATE_COLORS[state] || STATE_COLORS.unknown
}

// ============================================================================
// Module-level subscribable snapshot (PR 9359 pattern)
// ============================================================================

const EMPTY_AWARENESS: FederationAwareness = {
  hubs: [],
  clusters: [],
  groups: [],
  pendingJoins: [],
  errors: [],
  isDemoFallback: false,
}

let federationSnapshot: FederationAwareness = EMPTY_AWARENESS
const federationListeners = new Set<() => void>()

function subscribeFederation(listener: () => void): () => void {
  federationListeners.add(listener)
  return () => federationListeners.delete(listener)
}

function getFederationSnapshot(): FederationAwareness {
  return federationSnapshot
}

function publishFederation(next: FederationAwareness): void {
  federationSnapshot = next
  federationListeners.forEach(listener => listener())
}

// ============================================================================
// Demo data
// ============================================================================

const DEMO_HUBS: ProviderHubStatus[] = [
  { provider: 'ocm', hubContext: 'hub-prod', detected: true, version: 'v1' },
  { provider: 'ocm', hubContext: 'hub-staging', detected: true, version: 'v1' },
  { provider: 'capi', hubContext: 'capi-mgmt', detected: true, version: 'v1beta1' },
  { provider: 'karmada', hubContext: 'karmada-control', detected: true, version: 'v1alpha1' },
  { provider: 'clusternet', hubContext: 'clusternet-parent', detected: true, version: 'v1beta1' },
  { provider: 'liqo', hubContext: 'liqo-local', detected: true, version: 'v1alpha1' },
  { provider: 'kubeadmiral', hubContext: 'kubeadmiral-ctl', detected: true, version: 'v1alpha1' },
]

const DEMO_CLUSTERS: FederatedCluster[] = [
  {
    provider: 'ocm', hubContext: 'hub-prod', name: 'eks-prod-us-east-1',
    state: 'joined', available: 'True', clusterSet: 'production',
    labels: { env: 'prod', region: 'us-east-1' },
    apiServerURL: 'https://eks-prod.us-east-1.eks.amazonaws.com',
  },
  {
    provider: 'ocm', hubContext: 'hub-prod', name: 'openshift-prod',
    state: 'joined', available: 'True', clusterSet: 'production',
    labels: { env: 'prod', distribution: 'openshift' },
    apiServerURL: 'https://api.openshift-prod.example.com:6443',
  },
  {
    provider: 'ocm', hubContext: 'hub-staging', name: 'gke-staging',
    state: 'joined', available: 'True', clusterSet: 'staging',
    labels: { env: 'staging', region: 'us-central1' },
    apiServerURL: 'https://gke-staging.us-central1.gke.io',
  },
  {
    provider: 'ocm', hubContext: 'hub-staging', name: 'aks-dev-westeu',
    state: 'pending', available: 'Unknown',
    labels: { env: 'dev', region: 'westeurope' },
  },
  {
    provider: 'capi', hubContext: 'capi-mgmt', name: 'workload-prod-aws',
    state: 'provisioned', available: 'True',
    labels: { env: 'prod', infra: 'aws' },
    apiServerURL: 'https://workload-prod-aws.us-east-1.elb.amazonaws.com:6443',
    lifecycle: {
      phase: 'Provisioned',
      controlPlaneReady: true,
      infrastructureReady: true,
      desiredMachines: 3,
      readyMachines: 3,
    },
  },
  {
    provider: 'capi', hubContext: 'capi-mgmt', name: 'workload-staging-aws',
    state: 'provisioning', available: 'Unknown',
    labels: { env: 'staging', infra: 'aws' },
    lifecycle: {
      phase: 'Provisioning',
      controlPlaneReady: false,
      infrastructureReady: false,
      desiredMachines: 2,
      readyMachines: 0,
    },
  },
  {
    provider: 'capi', hubContext: 'capi-mgmt', name: 'workload-dev-docker',
    state: 'failed', available: 'False',
    labels: { env: 'dev', infra: 'docker' },
    lifecycle: {
      phase: 'Failed',
      controlPlaneReady: false,
      infrastructureReady: false,
      desiredMachines: 1,
      readyMachines: 0,
    },
  },
  {
    provider: 'karmada', hubContext: 'karmada-control', name: 'karmada-member-1',
    state: 'joined', available: 'True',
    labels: { env: 'prod', region: 'ap-southeast-1' },
    apiServerURL: 'https://karmada-member-1.ap-southeast-1.example.com:6443',
  },
  {
    provider: 'karmada', hubContext: 'karmada-control', name: 'karmada-member-2',
    state: 'pending', available: 'False',
    labels: { env: 'staging', region: 'eu-west-1' },
    apiServerURL: 'https://karmada-member-2.eu-west-1.example.com:6443',
  },
  {
    provider: 'clusternet', hubContext: 'clusternet-parent', name: 'child-cluster-1',
    state: 'joined', available: 'True',
    labels: { 'clusternet.io/cluster-id': 'cn-abc-123', env: 'prod' },
    apiServerURL: 'https://child-1.clusternet.example.com:6443',
  },
  {
    provider: 'clusternet', hubContext: 'clusternet-parent', name: 'child-cluster-2',
    state: 'pending', available: 'False',
    labels: { 'clusternet.io/cluster-id': 'cn-def-456' },
  },
  {
    provider: 'liqo', hubContext: 'liqo-local', name: 'peer-rome',
    state: 'joined', available: 'True',
    labels: { 'liqo.io/remote-cluster-id': 'lq-rome' },
    apiServerURL: 'https://peer-rome.liqo.example.com:6443',
  },
  {
    provider: 'liqo', hubContext: 'liqo-local', name: 'peer-berlin',
    state: 'pending', available: 'Unknown',
    labels: { 'liqo.io/remote-cluster-id': 'lq-berlin' },
  },
  {
    provider: 'kubeadmiral', hubContext: 'kubeadmiral-ctl', name: 'member-east',
    state: 'joined', available: 'True',
    labels: { region: 'us-east-1', tier: 'production' },
    apiServerURL: 'https://member-east.kubeadmiral.example.com:6443',
  },
  {
    provider: 'kubeadmiral', hubContext: 'kubeadmiral-ctl', name: 'member-west',
    state: 'pending', available: 'False',
    labels: { region: 'us-west-2' },
  },
]

const DEMO_GROUPS: FederatedGroup[] = [
  { provider: 'ocm', hubContext: 'hub-prod', name: 'production', members: ['eks-prod-us-east-1', 'openshift-prod'], kind: 'set' },
  { provider: 'ocm', hubContext: 'hub-staging', name: 'staging', members: ['gke-staging'], kind: 'set' },
  { provider: 'capi', hubContext: 'capi-mgmt', name: 'capi:awscluster', members: ['workload-prod-aws', 'workload-staging-aws'], kind: 'infra' },
  { provider: 'karmada', hubContext: 'karmada-control', name: 'deploy-to-apac', members: ['karmada-member-1'], kind: 'selector' },
  { provider: 'clusternet', hubContext: 'clusternet-parent', name: 'cn-abc-123', members: ['child-cluster-1'], kind: 'selector' },
  { provider: 'liqo', hubContext: 'liqo-local', name: 'peers', members: ['peer-rome'], kind: 'peer' },
  { provider: 'kubeadmiral', hubContext: 'kubeadmiral-ctl', name: 'region=us-east-1', members: ['member-east'], kind: 'selector' },
]

const FIVE_MINUTES_MS = 300_000
const TEN_MINUTES_MS = 600_000
const TWO_MINUTES_MS = 120_000
const THREE_MINUTES_MS = 180_000

const DEMO_PENDING: PendingJoin[] = [
  {
    provider: 'ocm', hubContext: 'hub-staging', clusterName: 'aks-dev-westeu',
    requestedAt: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
    detail: 'CSR: csr-aks-dev-westeu-1',
  },
  {
    provider: 'karmada', hubContext: 'karmada-control', clusterName: 'karmada-member-2',
    requestedAt: new Date(Date.now() - TEN_MINUTES_MS).toISOString(),
    detail: 'Cluster Ready condition is not True',
  },
  {
    provider: 'clusternet', hubContext: 'clusternet-parent', clusterName: 'child-cluster-2',
    requestedAt: new Date(Date.now() - TWO_MINUTES_MS).toISOString(),
    detail: 'ManagedCluster: child-cluster-2 (Ready=False or missing)',
  },
  {
    provider: 'liqo', hubContext: 'liqo-local', clusterName: 'peer-berlin',
    requestedAt: new Date(Date.now() - TEN_MINUTES_MS).toISOString(),
    detail: 'ForeignCluster: peer-berlin (peering not active)',
  },
  {
    provider: 'kubeadmiral', hubContext: 'kubeadmiral-ctl', clusterName: 'member-west',
    requestedAt: new Date(Date.now() - THREE_MINUTES_MS).toISOString(),
    detail: 'FederatedCluster: member-west (Ready=False or missing)',
  },
]

function getDemoFederationAwareness(): FederationAwareness {
  return {
    hubs: DEMO_HUBS,
    clusters: DEMO_CLUSTERS,
    groups: DEMO_GROUPS,
    pendingJoins: DEMO_PENDING,
    errors: [],
    isDemoFallback: true,
  }
}

// ============================================================================
// Fetch helpers
// ============================================================================

const FEDERATION_POLL_INTERVAL_MS = 30_000
const FEDERATION_DETECT_CACHE_TTL_MS = 300_000

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function fetchFederationEndpoint<T>(path: string): Promise<T | null> {
  if (!LOCAL_AGENT_HTTP_URL) return null
  try {
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}${path}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!response.ok) return null
    return await response.json() as T
  } catch {
    return null
  }
}

// ============================================================================
// Fetcher
// ============================================================================

let lastDetectTime = 0
let cachedHubs: ProviderHubStatus[] = []
let fetchInFlight = false

async function fetchFederationData(): Promise<void> {
  if (fetchInFlight) return
  fetchInFlight = true

  try {
    const now = Date.now()
    if (now - lastDetectTime > FEDERATION_DETECT_CACHE_TTL_MS || cachedHubs.length === 0) {
      const hubs = await fetchFederationEndpoint<ProviderHubStatus[]>('/federation/detect')
      if (hubs) {
        cachedHubs = hubs
        lastDetectTime = now
      }
    }

    const detectedHubs = cachedHubs.filter(h => h.detected)
    if (detectedHubs.length === 0) {
      publishFederation({
        hubs: cachedHubs,
        clusters: [],
        groups: [],
        pendingJoins: [],
        errors: (cachedHubs || []).filter(h => h.error).map(h => h.error!),
        isDemoFallback: false,
      })
      return
    }

    const [clustersRes, groupsRes, pendingRes] = await Promise.all([
      fetchFederationEndpoint<{ clusters: FederatedCluster[]; errors: FederationError[] }>('/federation/clusters'),
      fetchFederationEndpoint<{ groups: FederatedGroup[]; errors: FederationError[] }>('/federation/groups'),
      fetchFederationEndpoint<{ pendingJoins: PendingJoin[]; errors: FederationError[] }>('/federation/pending-joins'),
    ])

    const allErrors: FederationError[] = [
      ...(cachedHubs || []).filter(h => h.error).map(h => h.error!),
      ...(clustersRes?.errors || []),
      ...(groupsRes?.errors || []),
      ...(pendingRes?.errors || []),
    ]

    publishFederation({
      hubs: cachedHubs,
      clusters: clustersRes?.clusters || [],
      groups: groupsRes?.groups || [],
      pendingJoins: pendingRes?.pendingJoins || [],
      errors: allErrors,
      isDemoFallback: false,
    })
  } catch {
    // leave current snapshot in place
  } finally {
    fetchInFlight = false
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useFederationAwareness(): FederationAwareness {
  const { isDemoMode } = useDemoMode()

  useEffect(() => {
    if (isDemoMode) {
      publishFederation(getDemoFederationAwareness())
      return
    }

    fetchFederationData()
    const interval = setInterval(fetchFederationData, FEDERATION_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isDemoMode])

  return useSyncExternalStore(subscribeFederation, getFederationSnapshot)
}

export function useFederationForCluster(clusterName: string, apiServerURL?: string): {
  pills: Array<{ provider: FederationProviderName; hubContext: string; state: ClusterState }>
} {
  const awareness = useFederationAwareness()

  const pills = (awareness.clusters || []).filter(fc => {
    if (fc.name === clusterName) return true
    if (apiServerURL && fc.apiServerURL && fc.apiServerURL === apiServerURL) return true
    return false
  }).map(fc => ({
    provider: fc.provider,
    hubContext: fc.hubContext,
    state: fc.state,
  }))

  return { pills }
}

export function resetFederationCache(): void {
  lastDetectTime = 0
  cachedHubs = []
  publishFederation(EMPTY_AWARENESS)
}
