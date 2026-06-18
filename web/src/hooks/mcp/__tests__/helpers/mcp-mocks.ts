import type { ClusterInfo } from '../types'

// ---------------------------------------------------------------------------
// Constants (mirror source values to avoid magic numbers in tests)
// ---------------------------------------------------------------------------

/** 5 minutes — same as OFFLINE_THRESHOLD_MS in shared.ts */
export const OFFLINE_THRESHOLD_MS = 5 * 60_000

/** Same threshold as AUTO_GENERATED_NAME_LENGTH_THRESHOLD in shared.ts */
export const AUTO_GENERATED_NAME_LENGTH_THRESHOLD = 50

/** Same debounce delay as CLUSTER_NOTIFY_DEBOUNCE_MS in shared.ts */
export const CLUSTER_NOTIFY_DEBOUNCE_MS = 50

/** fetchWithRetry default max retries */
export const DEFAULT_MAX_RETRIES = 2

/** fetchWithRetry default initial backoff */
export const DEFAULT_INITIAL_BACKOFF_MS = 500

// ---------------------------------------------------------------------------
// Cluster builder
// ---------------------------------------------------------------------------

/** Build a minimal valid ClusterInfo for use in shared.ts tests. */
export function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'test-cluster',
    context: 'test-context',
    server: 'https://test.example.com:6443',
    healthy: true,
    source: 'kubeconfig',
    nodeCount: 3,
    podCount: 20,
    cpuCores: 8,
    memoryGB: 32,
    storageGB: 100,
    ...overrides,
  }
}
