import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterTabs, type FilterType, type SortByType } from './FilterTabs'
import type { ClusterStats } from './StatsOverview'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const baseStats: ClusterStats = {
  total: 10,
  loading: 0,
  healthy: 7,
  unhealthy: 2,
  unreachable: 1,
  totalNodes: 20,
  totalCPUs: 80,
  totalMemoryGB: 256,
  totalStorageGB: 1024,
  totalPods: 200,
  totalGPUs: 0,
  allocatedGPUs: 0,
}

function renderFilterTabs(overrides: Partial<Parameters<typeof FilterTabs>[0]> = {}) {
  const props = {
    stats: baseStats,
    filter: 'all' as FilterType,
    onFilterChange: vi.fn(),
    sortBy: 'name' as SortByType,
    onSortByChange: vi.fn(),
    sortAsc: true,
    onSortAscChange: vi.fn(),
    ...overrides,
  }
  const result = render(<FilterTabs {...props} />)
  return { ...result, props }
}

describe('FilterTabs', () => {
  it('renders all filter buttons with correct counts', () => {
    renderFilterTabs()

    expect(screen.getByText('All (10)')).toBeTruthy()
    expect(screen.getByText('Healthy (7)')).toBeTruthy()
    expect(screen.getByText('Unhealthy (2)')).toBeTruthy()
    expect(screen.getByText(/Offline \(1\)/)).toBeTruthy()
  })

  it('calls onFilterChange with the correct filter type', () => {
    const { props } = renderFilterTabs()

    fireEvent.click(screen.getByText('Healthy (7)'))
    expect(props.onFilterChange).toHaveBeenCalledWith('healthy')

    fireEvent.click(screen.getByText('Unhealthy (2)'))
    expect(props.onFilterChange).toHaveBeenCalledWith('unhealthy')

    fireEvent.click(screen.getByText(/Offline \(1\)/))
    expect(props.onFilterChange).toHaveBeenCalledWith('unreachable')
  })

  it('calls onSortByChange when sort dropdown changes', () => {
    const { props } = renderFilterTabs({ sortBy: 'custom' })
    const select = screen.getByDisplayValue('common.custom')

    fireEvent.change(select, { target: { value: 'health' } })
    expect(props.onSortByChange).toHaveBeenCalledWith('health')
  })

  it('toggles sort direction when sort button is clicked', () => {
    const { props } = renderFilterTabs({ sortAsc: true })
    // The sort direction toggle button has a title
    const toggleBtn = screen.getByTitle('Ascending')
    fireEvent.click(toggleBtn)
    expect(props.onSortAscChange).toHaveBeenCalledWith(false)
  })

  it('shows Add Cluster button when onAddCluster is provided', () => {
    const onAddCluster = vi.fn()
    renderFilterTabs({ onAddCluster })

    const addBtn = screen.getByText('cluster.addCluster')
    expect(addBtn).toBeTruthy()
    fireEvent.click(addBtn)
    expect(onAddCluster).toHaveBeenCalled()
  })

  it('does not show Add Cluster button when onAddCluster is not provided', () => {
    renderFilterTabs()
    expect(screen.queryByText('cluster.addCluster')).toBeNull()
  })

  it('shows Create Cluster with AI button when onCreateClusterWithAI is provided', () => {
    const onCreateClusterWithAI = vi.fn()
    renderFilterTabs({ onCreateClusterWithAI })

    const createBtn = screen.getByText('cluster.createClusterWithAI')
    expect(createBtn).toBeTruthy()
    fireEvent.click(createBtn)
    expect(onCreateClusterWithAI).toHaveBeenCalled()
  })

  it('does not show Create Cluster with AI button when onCreateClusterWithAI is not provided', () => {
    renderFilterTabs()
    expect(screen.queryByText('cluster.createClusterWithAI')).toBeNull()
  })

  it('renders both buttons adjacent when both handlers are provided', () => {
    const onAddCluster = vi.fn()
    const onCreateClusterWithAI = vi.fn()
    renderFilterTabs({ onAddCluster, onCreateClusterWithAI })

    const addBtn = screen.getByText('cluster.addCluster')
    const createBtn = screen.getByText('cluster.createClusterWithAI')
    expect(addBtn).toBeTruthy()
    expect(createBtn).toBeTruthy()

    // Both buttons should share a common parent container
    expect(addBtn.closest('div')).toBe(createBtn.closest('div'))
  })

  it('keeps Add Cluster primary and makes Create Cluster with AI secondary', () => {
    const onAddCluster = vi.fn()
    const onCreateClusterWithAI = vi.fn()
    renderFilterTabs({ onAddCluster, onCreateClusterWithAI })

    const addBtn = screen.getByRole('button', { name: 'cluster.addCluster' })
    const createBtn = screen.getByRole('button', { name: 'cluster.createClusterWithAI' })

    expect(addBtn.className).toContain('bg-primary')
    expect(addBtn.className).toContain('text-primary-foreground')
    expect(createBtn.className).toContain('bg-card/50')
    expect(createBtn.className).toContain('border-border')
    expect(createBtn.className).toContain('text-muted-foreground')
    expect(createBtn.className).not.toContain('bg-primary')
  })
})
