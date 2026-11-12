import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClusterInfo } from '../../../hooks/useMCP'
import { ResourcesClusterListHeader, ResourcesSummary, SortableClusterRow } from './ResourcesDrillDown.parts'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}))

vi.mock('../../charts/Gauge', () => ({
  Gauge: ({ value }: { value: number }) => <span data-testid="gauge">{value}</span>,
}))

vi.mock('../../charts/StatusIndicator', () => ({
  StatusIndicator: ({ status }: { status: string }) => <span data-testid="status">{status}</span>,
}))

vi.mock('../../shared/TechnicalAcronym', () => ({
  TechnicalAcronym: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

const GPU = { key: 'gpu', label: 'GPU', color: 'text-green-400' }
const CPU_PERCENT = 40
const MEMORY_PERCENT = 55
const MEMORY_GB = 64
const TB_MEMORY_GB = 2048

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return { name: 'ctx/cluster-1', context: 'ctx', healthy: true, reachable: true, nodeCount: 3, podCount: 20, cpuCores: 16, ...overrides } as ClusterInfo
}

describe('SortableClusterRow', () => {
  it('renders the short cluster name and healthy status, and drills down on click', () => {
    const onDrillDown = vi.fn()
    render(<SortableClusterRow cluster={makeCluster()} cpuPercent={CPU_PERCENT} memoryPercent={MEMORY_PERCENT} memoryGB={MEMORY_GB} accelerators={[]} onDrillDown={onDrillDown} />)
    expect(screen.getByText('cluster-1')).toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('healthy')
    expect(screen.getByText('64G')).toBeInTheDocument()
    fireEvent.click(screen.getByText('cluster-1'))
    expect(onDrillDown).toHaveBeenCalledTimes(1)
  })

  it('does not drill down when the drag handle is clicked', () => {
    const onDrillDown = vi.fn()
    render(<SortableClusterRow cluster={makeCluster()} cpuPercent={CPU_PERCENT} memoryPercent={MEMORY_PERCENT} memoryGB={MEMORY_GB} accelerators={[]} onDrillDown={onDrillDown} />)
    fireEvent.click(screen.getByTitle('resourcesDrillDown.dragToReorder'))
    expect(onDrillDown).not.toHaveBeenCalled()
  })

  it('shows unreachable and offline for unreachable clusters', () => {
    render(<SortableClusterRow cluster={makeCluster({ reachable: false })} cpuPercent={0} memoryPercent={0} memoryGB={0} accelerators={[]} onDrillDown={vi.fn()} />)
    expect(screen.getByTestId('status')).toHaveTextContent('unreachable')
    expect(screen.getByText('resourcesDrillDown.offline')).toBeInTheDocument()
  })

  it('shows error status for unhealthy clusters without nodes', () => {
    render(<SortableClusterRow cluster={makeCluster({ healthy: false, nodeCount: 0 })} cpuPercent={0} memoryPercent={0} memoryGB={0} accelerators={[]} onDrillDown={vi.fn()} />)
    expect(screen.getByTestId('status')).toHaveTextContent('error')
  })

  it('formats terabyte memory', () => {
    render(<SortableClusterRow cluster={makeCluster()} cpuPercent={CPU_PERCENT} memoryPercent={MEMORY_PERCENT} memoryGB={TB_MEMORY_GB} accelerators={[]} onDrillDown={vi.fn()} />)
    expect(screen.getByText('2.0T')).toBeInTheDocument()
  })

  it('renders accelerator gauges with and without capacity', () => {
    const { rerender } = render(
      <SortableClusterRow cluster={makeCluster()} cpuPercent={CPU_PERCENT} memoryPercent={MEMORY_PERCENT} memoryGB={MEMORY_GB} accelerators={[{ ...GPU, data: { total: 8, allocated: 4 } }]} onDrillDown={vi.fn()} />
    )
    expect(screen.getByText('4/8')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    rerender(
      <SortableClusterRow cluster={makeCluster()} cpuPercent={CPU_PERCENT} memoryPercent={MEMORY_PERCENT} memoryGB={MEMORY_GB} accelerators={[{ ...GPU, data: { total: 0, allocated: 0 } }]} onDrillDown={vi.fn()} />
    )
    expect(screen.getByText(/resourcesDrillDown.noAccelerator/)).toBeInTheDocument()
  })
})

describe('ResourcesSummary', () => {
  const totals = { cpus: 128, cpuRequests: 64, cpuPercent: 50, nodes: 9, pods: 100, memoryGB: MEMORY_GB, memoryRequestsGB: 32, memoryPercent: 50 }

  it('renders summary cards and accelerator totals', () => {
    render(<ResourcesSummary clustersCount={2} totals={totals} accelerators={[{ ...GPU, globalData: { total: 10, allocated: 3 } }]} />)
    expect(screen.getByText('resourcesDrillDown.clusters')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('64 GB')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('/10')).toBeInTheDocument()
  })

  it('formats memory capacity in TB for large totals', () => {
    render(<ResourcesSummary clustersCount={1} totals={{ ...totals, memoryGB: TB_MEMORY_GB }} accelerators={[]} />)
    expect(screen.getByText('2.0 TB')).toBeInTheDocument()
  })
})

describe('ResourcesClusterListHeader', () => {
  it('renders column headers including accelerators', () => {
    render(<ResourcesClusterListHeader clustersCount={3} accelerators={[{ ...GPU, globalData: { total: 1, allocated: 0 } }]} />)
    expect(screen.getByText(/resourcesDrillDown.clustersWithCount/)).toBeInTheDocument()
    expect(screen.getByText('common.cpu')).toBeInTheDocument()
    expect(screen.getByText('common.memory')).toBeInTheDocument()
    expect(screen.getByText('GPU')).toBeInTheDocument()
  })
})
