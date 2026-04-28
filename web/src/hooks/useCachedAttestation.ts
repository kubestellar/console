/**
 * useCachedAttestation — Hook for the Runtime Attestation Score card (#9987).
 *
 * Follows the useCached* caching contract from CLAUDE.md:
 *   - Returns: data, isLoading, isRefreshing, isDemoData, isFailed,
 *     consecutiveFailures, lastRefresh, refetch.
 *   - isDemoData is suppressed while isLoading is true (so CardWrapper shows
 *     a skeleton instead of flashing demo data).
 *
 * Data source: GET /api/attestation/score — returns per-cluster scores from
 * four CNCF signals (TUF, SPIFFE/SPIRE, Kyverno, privilege posture).
 */

import { useCache, type RefreshCategory } from '../lib/cache'
import { useDemoMode } from './useDemoMode'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

// ---------------------------------------------------------------------------
// Constants (no magic numbers)
// ---------------------------------------------------------------------------

const CACHE_KEY_ATTESTATION = 'runtime_attestation_score'

/** Weight percentages for each scoring signal — must match backend. */
export const WEIGHT_IMAGE_PROVENANCE = 30
export const WEIGHT_WORKLOAD_IDENTITY = 25
export const WEIGHT_POLICY_COMPLIANCE = 25
export const WEIGHT_PRIVILEGE_POSTURE = 20

/** Score thresholds for color classification. */
export const SCORE_THRESHOLD_HIGH = 80
export const SCORE_THRESHOLD_MEDIUM = 60

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttestationSignal {
  name: string
  score: number
  weight: number
  detail: string
}

export interface NonCompliantWorkload {
  name: string
  namespace: string
  reason: string
  signal: string
}

export interface ClusterAttestationScore {
  cluster: string
  overallScore: number
  signals: AttestationSignal[]
  nonCompliantWorkloads: NonCompliantWorkload[]
}

export interface AttestationData {
  clusters: ClusterAttestationScore[]
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_DATA: AttestationData = {
  clusters: [
    {
      cluster: 'eks-prod-us-east-1',
      overallScore: 92,
      signals: [
        { name: 'Image Provenance', score: 92, weight: WEIGHT_IMAGE_PROVENANCE, detail: 'Nearly all images signed via TUF trust root' },
        { name: 'Workload Identity', score: 95, weight: WEIGHT_WORKLOAD_IDENTITY, detail: 'SPIFFE identities cover most workloads' },
        { name: 'Policy Compliance', score: 88, weight: WEIGHT_POLICY_COMPLIANCE, detail: 'Kyverno audit policies passing at high rate' },
        { name: 'Privilege Posture', score: 100, weight: WEIGHT_PRIVILEGE_POSTURE, detail: 'No privileged or hostPath containers detected' },
      ],
      nonCompliantWorkloads: [
        { name: 'legacy-api', namespace: 'default', reason: 'Image not signed with TUF trust root', signal: 'Image Provenance' },
        { name: 'debug-pod', namespace: 'kube-system', reason: 'Kyverno audit policy violation', signal: 'Policy Compliance' },
      ],
    },
    {
      cluster: 'gke-staging',
      overallScore: 85,
      signals: [
        { name: 'Image Provenance', score: 85, weight: WEIGHT_IMAGE_PROVENANCE, detail: 'Most images signed; some unsigned images remain' },
        { name: 'Workload Identity', score: 80, weight: WEIGHT_WORKLOAD_IDENTITY, detail: 'Partial SPIFFE coverage — some workloads unidentified' },
        { name: 'Policy Compliance', score: 90, weight: WEIGHT_POLICY_COMPLIANCE, detail: 'Kyverno audit policies passing at high rate' },
        { name: 'Privilege Posture', score: 95, weight: WEIGHT_PRIVILEGE_POSTURE, detail: 'Nearly all containers follow least-privilege' },
      ],
      nonCompliantWorkloads: [
        { name: 'legacy-api', namespace: 'default', reason: 'Image not signed with TUF trust root', signal: 'Image Provenance' },
        { name: 'batch-worker', namespace: 'jobs', reason: 'No SPIFFE identity assigned', signal: 'Workload Identity' },
        { name: 'node-exporter', namespace: 'monitoring', reason: 'Runs as privileged container', signal: 'Privilege Posture' },
      ],
    },
    {
      cluster: 'k3s-edge',
      overallScore: 68,
      signals: [
        { name: 'Image Provenance', score: 70, weight: WEIGHT_IMAGE_PROVENANCE, detail: 'Most images signed; some unsigned images remain' },
        { name: 'Workload Identity', score: 60, weight: WEIGHT_WORKLOAD_IDENTITY, detail: 'Low SPIFFE/SPIRE coverage across workloads' },
        { name: 'Policy Compliance', score: 75, weight: WEIGHT_POLICY_COMPLIANCE, detail: 'Some Kyverno policy violations detected' },
        { name: 'Privilege Posture', score: 80, weight: WEIGHT_PRIVILEGE_POSTURE, detail: 'Nearly all containers follow least-privilege' },
      ],
      nonCompliantWorkloads: [
        { name: 'legacy-api', namespace: 'default', reason: 'Image not signed with TUF trust root', signal: 'Image Provenance' },
        { name: 'batch-worker', namespace: 'jobs', reason: 'No SPIFFE identity assigned', signal: 'Workload Identity' },
        { name: 'debug-pod', namespace: 'kube-system', reason: 'Kyverno audit policy violation', signal: 'Policy Compliance' },
        { name: 'node-exporter', namespace: 'monitoring', reason: 'Runs as privileged container', signal: 'Privilege Posture' },
      ],
    },
    {
      cluster: 'openshift-prod',
      overallScore: 97,
      signals: [
        { name: 'Image Provenance', score: 96, weight: WEIGHT_IMAGE_PROVENANCE, detail: 'Nearly all images signed via TUF trust root' },
        { name: 'Workload Identity', score: 100, weight: WEIGHT_WORKLOAD_IDENTITY, detail: 'SPIFFE identities cover most workloads' },
        { name: 'Policy Compliance', score: 94, weight: WEIGHT_POLICY_COMPLIANCE, detail: 'Kyverno audit policies passing at high rate' },
        { name: 'Privilege Posture', score: 100, weight: WEIGHT_PRIVILEGE_POSTURE, detail: 'No privileged or hostPath containers detected' },
      ],
      nonCompliantWorkloads: [
        { name: 'legacy-api', namespace: 'default', reason: 'Image not signed with TUF trust root', signal: 'Image Provenance' },
        { name: 'debug-pod', namespace: 'kube-system', reason: 'Kyverno audit policy violation', signal: 'Policy Compliance' },
      ],
    },
  ],
}

/** Initial empty payload while the first fetch resolves. */
const INITIAL_DATA: AttestationData = {
  clusters: [],
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchAttestationScore(): Promise<AttestationData> {
  const resp = await fetch('/api/attestation/score', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) throw new Error(`attestation HTTP ${resp.status}`)

  const body: AttestationData = await resp.json()
  return {
    clusters: Array.isArray(body?.clusters) ? body.clusters : [],
  }
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseCachedAttestationResult {
  data: AttestationData
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedAttestation(): UseCachedAttestationResult {
  const { isDemoMode } = useDemoMode()

  const result = useCache<AttestationData>({
    key: CACHE_KEY_ATTESTATION,
    category: 'default' as RefreshCategory,
    initialData: INITIAL_DATA,
    demoData: DEMO_DATA,
    persist: true,
    fetcher: fetchAttestationScore,
  })

  // Never surface demo data during loading (CLAUDE.md rule).
  const isDemoData = (isDemoMode || result.isDemoFallback) && !result.isLoading
  const isRefreshing = isDemoMode ? false : result.isRefreshing

  return {
    data: isDemoMode ? DEMO_DATA : result.data,
    isLoading: isDemoMode ? false : result.isLoading,
    isRefreshing,
    isDemoData,
    isFailed: isDemoMode ? false : result.isFailed,
    consecutiveFailures: isDemoMode ? 0 : result.consecutiveFailures,
    lastRefresh: isDemoMode ? Date.now() : result.lastRefresh,
    refetch: result.refetch,
  }
}
