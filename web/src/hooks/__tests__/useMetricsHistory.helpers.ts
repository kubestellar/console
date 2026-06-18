import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MetricsSnapshot } from '../../types/predictions'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Mock useMCP hooks
export const mockClusters: Array<Record<string, unknown>> = []
export const mockPodIssues: Array<Record<string, unknown>> = []
export const mockGPUNodes: Array<Record<string, unknown>> = []

vi.mock('../useMCP', () => ({
  useClusters: () => ({ deduplicatedClusters: mockClusters }),
  usePodIssues: () => ({ issues: mockPodIssues }),
  useGPUNodes: () => ({ nodes: mockGPUNodes }),
}))

vi.mock('../usePredictionSettings', () => ({
  getPredictionSettings: () => ({ interval: 10 }),
}))

// ---------------------------------------------------------------------------
// Constants (must match the source)
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'kubestellar-metrics-history'
export const HISTORY_CHANGED_EVENT = 'kubestellar-metrics-history-changed'
export const MAX_SNAPSHOTS = 1008

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeSnapshot(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    timestamp: new Date().toISOString(),
    clusters: [],
    podIssues: [],
    gpuNodes: [],
    ...overrides,
  }
}

export function makeClusterSnapshot(
  clusterName: string,
  cpu: number,
  mem: number,
  timestamp?: string,
): MetricsSnapshot {
  return {
    timestamp: timestamp ?? new Date().toISOString(),
    clusters: [{ name: clusterName, cpuPercent: cpu, memoryPercent: mem, nodeCount: 3, healthyNodes: 3 }],
    podIssues: [],
    gpuNodes: [],
  }
}

export function makePodSnapshot(
  podName: string,
  cluster: string,
  restarts: number,
  timestamp?: string,
): MetricsSnapshot {
  return {
    timestamp: timestamp ?? new Date().toISOString(),
    clusters: [],
    podIssues: [{ name: podName, cluster, restarts, status: 'CrashLoopBackOff' }],
    gpuNodes: [],
  }
}

/**
 * Because the module uses singleton state at the module level, we need to
 * re-import it for each test to get a clean slate. This helper handles that.
 */
export async function importFresh() {
  // Reset module registry so module-level code re-runs
  vi.resetModules()
  const mod = await import('../useMetricsHistory')
  return mod
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.clearAllMocks()
  // Reset mock data
  mockClusters.length = 0
  mockPodIssues.length = 0
  mockGPUNodes.length = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})
