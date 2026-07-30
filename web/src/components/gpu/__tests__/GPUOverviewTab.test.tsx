import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GPUOverviewTab } from '../GPUOverviewTab'
import type { GPUOverviewTabProps } from '../GPUOverviewTab'
import type { GPUOverviewStats } from '../gpuOverviewStats'

// ── Lightweight component mocks ──────────────────────────────────────────────

vi.mock('../../charts/PieChart', () => ({
  DonutChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="donut-chart" data-count={data.length} />
  ),
}))

vi.mock('../../charts/BarChart', () => ({
  BarChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="bar-chart" data-count={data.length} />
  ),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

vi.mock('../../shared/TechnicalAcronym', () => ({
  TechnicalAcronym: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../lib/theme/chartColors', () => ({
  getChartColorByName: () => '#8b5cf6',
  PURPLE_600: '#8b5cf6',
}))

vi.mock('../../charts/Sparkline', () => ({
  Sparkline: () => <div data-testid="sparkline" />,
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeStats = (overrides: Partial<GPUOverviewStats> = {}): GPUOverviewStats => ({
  totalGPUs: 10,
  allocatedGPUs: 4,
  availableGPUs: 6,
  utilizationPercent: 40,
  activeReservations: 2,
  reservedGPUs: 4,
  typeChartData: [],
  usageByNamespace: [],
  clusterUsage: [],
  ...overrides,
})

const makeReservation = (overrides = {}) => ({
  id: 'res-1',
  user_id: 'u1',
  user_name: 'alice',
  title: 'My GPU Job',
  description: '',
  cluster: 'cluster-a',
  namespace: 'ml',
  gpu_count: 2,
  gpu_type: 'NVIDIA A100',
  gpu_types: ['NVIDIA A100'],
  start_date: '2024-01-15',
  duration_hours: 24,
  notes: '',
  status: 'active' as const,
  quota_name: '',
  quota_enforced: false,
  created_at: '2024-01-15T00:00:00Z',
  ...overrides,
})

function renderTab(overrides: Partial<GPUOverviewTabProps> = {}) {
  const defaults: GPUOverviewTabProps = {
    stats: makeStats(),
    filteredReservations: [],
    utilizations: null,
    effectiveDemoMode: false,
    showOnlyMine: false,
  }
  return render(<GPUOverviewTab {...defaults} {...overrides} />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GPUOverviewTab', () => {
  it('displays the key headline stat numbers', () => {
    // Use distinct values for all stats to avoid multiple-match errors with getByText
    renderTab({ stats: makeStats({ totalGPUs: 8, availableGPUs: 3, activeReservations: 5, reservedGPUs: 6 }) })
    expect(screen.getByText('8')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('6')).toBeTruthy()
  })

  it('shows the utilization percentage in the donut gauge', () => {
    renderTab({ stats: makeStats({ utilizationPercent: 75 }) })
    expect(screen.getByText('75%')).toBeTruthy()
  })

  it('renders empty reservation message when no reservations exist', () => {
    renderTab({ filteredReservations: [], showOnlyMine: false })
    // t() returns the key
    expect(screen.getByText('gpuReservations.overview.noReservationsYet')).toBeTruthy()
  })

  it('renders "no my reservations" message when showOnlyMine and list is empty', () => {
    renderTab({ filteredReservations: [], showOnlyMine: true })
    expect(screen.getByText('gpuReservations.overview.noReservationsUser')).toBeTruthy()
  })

  it('renders reservation titles when reservations are provided', () => {
    const reservations = [makeReservation({ title: 'Training Run' })]
    renderTab({ filteredReservations: reservations })
    expect(screen.getByText('Training Run')).toBeTruthy()
  })

  it('renders cluster badge for each visible reservation', () => {
    const reservations = [makeReservation({ cluster: 'prod-cluster' })]
    renderTab({ filteredReservations: reservations })
    expect(screen.getByTestId('cluster-badge')).toBeTruthy()
    expect(screen.getByText('prod-cluster')).toBeTruthy()
  })

  it('shows a sparkline when utilization snapshots are provided', () => {
    const snapshots = [
      {
        id: 'snap-1',
        reservation_id: 'res-1',
        timestamp: '2024-01-15T10:00:00Z',
        gpu_utilization_pct: 60,
        memory_utilization_pct: 40,
        active_gpu_count: 1,
        total_gpu_count: 4,
      },
    ]
    const reservations = [makeReservation({ id: 'res-1' })]
    renderTab({ filteredReservations: reservations, utilizations: { 'res-1': snapshots } })
    expect(screen.getByTestId('sparkline')).toBeTruthy()
  })

  it('shows "no usage data yet" when utilizations is null for a reservation', () => {
    const reservations = [makeReservation()]
    renderTab({ filteredReservations: reservations, utilizations: null })
    // t('gpuReservations.utilization.noData', 'No usage data yet') returns the default value
    expect(screen.getByText('No usage data yet')).toBeTruthy()
  })

  it('calls onSelectReservation when an interactive reservation is clicked', () => {
    const onSelectReservation = vi.fn()
    const reservations = [makeReservation({ id: 'res-42' })]
    renderTab({ filteredReservations: reservations, onSelectReservation })
    const item = screen.getByRole('button', { name: /My GPU Job/ })
    item.click()
    expect(onSelectReservation).toHaveBeenCalledWith('res-42')
  })

  it('renders bar chart when clusterUsage data is present', () => {
    const stats = makeStats({ clusterUsage: [{ name: 'cluster-a', value: 4 }] })
    renderTab({ stats })
    expect(screen.getByTestId('bar-chart')).toBeTruthy()
  })
})
