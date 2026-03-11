/**
 * Tests that insight cards don't crash (React Error #31) when
 * relatedResources contains objects instead of plain strings.
 *
 * Background: Kubernetes event objects can be non-string references.
 * Without String() coercion, rendering them as React children throws
 * "Objects are not valid as a React child".
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { MultiClusterInsight } from '../../../types/insights'

// ----- shared mocks -----

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))
vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
}))
const mockStartMission = vi.fn()
const mockOpenSidebar = vi.fn()
const mockMissions: unknown[] = []

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({
    startMission: mockStartMission,
    openSidebar: mockOpenSidebar,
    missions: mockMissions,
    activeMission: null,
  }),
}))

/** Factory for a minimal insight whose relatedResources are objects, not strings */
function objectResourceInsight(
  category: MultiClusterInsight['category'],
  overrides: Partial<MultiClusterInsight> = {},
): MultiClusterInsight {
  return {
    id: `test-${category}`,
    category,
    source: 'heuristic',
    severity: 'warning',
    title: 'Test insight',
    description: 'Insight with object relatedResources',
    affectedClusters: ['cluster-a', 'cluster-b'],
    // Cast objects to string[] to simulate the runtime scenario
    // where Kubernetes object references slip through the type system
    relatedResources: [
      { kind: 'Pod', name: 'nginx-abc' } as unknown as string,
      { kind: 'Deployment', name: 'api-server' } as unknown as string,
    ],
    detectedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ============================================================
// ClusterDeltaDetector
// ============================================================
vi.mock('../../../hooks/useMultiClusterInsights', () => ({
  useMultiClusterInsights: vi.fn(),
}))
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))
vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [], isAllClustersSelected: true,
    customFilter: '', filterByCluster: (items: unknown[]) => items,
    filterBySeverity: (items: unknown[]) => items,
  }),
}))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Cell: () => <div />,
}))

import { useMultiClusterInsights } from '../../../hooks/useMultiClusterInsights'
import { ClusterDeltaDetector } from './ClusterDeltaDetector'
import { DeploymentRolloutTracker } from './DeploymentRolloutTracker'
import { RestartCorrelationMatrix } from './RestartCorrelationMatrix'

const mockInsights = vi.mocked(useMultiClusterInsights)

describe('Insight cards handle object relatedResources without crashing', () => {
  it('ClusterDeltaDetector renders String() for object relatedResources', () => {
    const insight = objectResourceInsight('cluster-delta', {
      deltas: [{
        dimension: 'cpu',
        significance: 'high' as const,
        clusterA: { name: 'cluster-a', value: 100 },
        clusterB: { name: 'cluster-b', value: 200 },
      }],
    })
    // Provide two insights so the selector renders relatedResources[0]
    mockInsights.mockReturnValue({
      insightsByCategory: { 'cluster-delta': [insight, { ...insight, id: 'test-2' }] },
      isLoading: false,
      isDemoData: false,
    } as ReturnType<typeof useMultiClusterInsights>)

    expect(() => render(<ClusterDeltaDetector />)).not.toThrow()
  })

  it('DeploymentRolloutTracker renders String() for object relatedResources', () => {
    const insight = objectResourceInsight('rollout-tracker', {
      metrics: { 'cluster-a_progress': 50, 'cluster-b_progress': 100 },
    })
    mockInsights.mockReturnValue({
      insightsByCategory: { 'rollout-tracker': [insight, { ...insight, id: 'test-2' }] },
      isLoading: false,
      isDemoData: false,
    } as ReturnType<typeof useMultiClusterInsights>)

    expect(() => render(<DeploymentRolloutTracker />)).not.toThrow()
  })

  it('RestartCorrelationMatrix renders String() for object relatedResources in infra list', () => {
    const insight = objectResourceInsight('restart-correlation', {
      id: 'test-infra-issue',
    })
    mockInsights.mockReturnValue({
      insightsByCategory: { 'restart-correlation': [insight] },
      isLoading: false,
      isDemoData: false,
    } as ReturnType<typeof useMultiClusterInsights>)

    expect(() => render(<RestartCorrelationMatrix />)).not.toThrow()
  })
})
