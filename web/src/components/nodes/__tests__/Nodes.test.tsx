import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useClusters, useGPUNodes } from '../../../hooks/useMCP'

// Mock modules with top-level localStorage side-effects
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => { },
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
}))
vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true, useDemoMode: () => true, isDemoModeForced: false,
}))
vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
}))
vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, subtitle, children, getStatValue }: { title: string; subtitle?: string; children?: React.ReactNode; getStatValue?: (id: string) => { value: any; progressValue?: number; max?: number } }) => (
    <div data-testid="dashboard-page" data-title={title} data-subtitle={subtitle}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      <div data-testid="stat-gpus">{getStatValue?.('gpus')?.value}</div>
      <div data-testid="stat-nodes-progress">{getStatValue?.('nodes')?.progressValue ?? ''}</div>
      <div data-testid="stat-nodes-max">{getStatValue?.('nodes')?.max ?? ''}</div>
      {children}
    </div>
  ),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [], clusters: [], isLoading: false, isRefreshing: false,
    lastUpdated: null, refetch: vi.fn(), error: null,
  })),
  useGPUNodes: vi.fn(() => ({ nodes: [] })),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [], isAllClustersSelected: true,
    customFilter: '', filterByCluster: (items: unknown[]) => items,
  }),
}))

vi.mock('../../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllNodes: vi.fn(), drillToAllGPU: vi.fn(),
    drillToAllPods: vi.fn(), drillToAllClusters: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: (primary: Function, fallback: Function) => (id: string) => primary(id) ?? fallback(id),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { Nodes } from '../Nodes'

describe('Nodes Component', () => {
  const renderNodes = () =>
    render(
      <MemoryRouter>
        <Nodes />
      </MemoryRouter>
    )

  it('renders without crashing', () => {
    expect(() => renderNodes()).not.toThrow()
  })

  it('renders the DashboardPage with correct title', () => {
    renderNodes()
    expect(screen.getByTestId('dashboard-page')).toBeTruthy()
    expect(screen.getAllByText(/nodes/i).length).toBeGreaterThan(0)
  })

  it('passes the correct subtitle', () => {
    renderNodes()
    const page = screen.getByTestId('dashboard-page')
    expect(page.getAttribute('data-subtitle')).toBeTruthy()
  })

  it('displays taint-aware GPU counts in stats', () => {
    vi.mocked(useGPUNodes).mockReturnValue({
      nodes: [
        { name: 'gpu-safe', cluster: 'c1', gpuCount: 4, gpuAllocated: 0, taints: [], acceleratorType: 'GPU' },
        { name: 'gpu-tainted', cluster: 'c1', gpuCount: 4, gpuAllocated: 0, taints: [{ key: 'special', value: 'yes', effect: 'NoSchedule' }], acceleratorType: 'GPU' },
      ],
    } as any)

    renderNodes()
    // By default, only untainted GPUs should be counted (4)
    expect(screen.getByTestId('stat-gpus').textContent).toBe('4')
  })

  it('uses healthy-to-total node ratio for node progress', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'healthy', reachable: true, healthy: true, nodeCount: 1, cpuCores: 4, memoryGB: 16, podCount: 8 },
      ],
      clusters: [],
      isLoading: false,
      isRefreshing: false,
      lastUpdated: null,
      refetch: vi.fn(),
      error: null,
    } as any)

    renderNodes()
    expect(screen.getByTestId('stat-nodes-progress').textContent).toBe('1')
    expect(screen.getByTestId('stat-nodes-max').textContent).toBe('1')
  })
})
