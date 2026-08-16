/**
 * Tests for NamespaceQuotasList (#22502, part of #22484).
 *
 * Covers: search input wiring, cluster/namespace scope badges, tab
 * switching, empty state with "create quota" CTA, quota row rendering
 * (with usage bar + edit/delete actions), and limit-range row rendering.
 */
import type React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceQuotasList } from '../NamespaceQuotasList'
import type { QuotaUsage, LimitRangeItem, TabKey } from '../NamespaceQuotas.types'
import type { ResourceQuota } from '../../../hooks/useMCP'

const QUOTA: QuotaUsage = {
  resource: 'CPU Requests',
  rawResource: 'requests.cpu',
  used: '2',
  limit: '4',
  percent: 50,
  cluster: 'cluster-a',
  namespace: 'team-a',
  quotaName: 'default-quota',
}

const UNIQUE_QUOTA: ResourceQuota = {
  cluster: 'cluster-a',
  namespace: 'team-a',
  name: 'default-quota',
  hard: { 'requests.cpu': '4' },
  used: { 'requests.cpu': '2' },
} as ResourceQuota

const LIMIT_ITEM: LimitRangeItem = {
  name: 'default-limits',
  type: 'Container',
  limits: { type: 'Container', default: { cpu: '500m' }, max: { cpu: '1' } },
  cluster: 'cluster-a',
  namespace: 'team-a',
}

const TABS: Array<{ key: TabKey; label: string; count: number }> = [
  { key: 'quotas', label: 'Quotas', count: 1 },
  { key: 'limits', label: 'Limits', count: 1 },
]

function basePagination(overrides: Partial<{ totalItems: number }> = {}) {
  return {
    currentPage: 1,
    totalPages: 1,
    totalItems: overrides.totalItems ?? 1,
    itemsPerPage: 5,
    goToPage: vi.fn(),
    needsPagination: false,
  }
}

function renderList(overrides: Partial<React.ComponentProps<typeof NamespaceQuotasList>> = {}) {
  const props: React.ComponentProps<typeof NamespaceQuotasList> = {
    searchValue: '',
    onSearchChange: vi.fn(),
    selectedCluster: 'all',
    selectedNamespace: 'all',
    activeTab: 'quotas',
    onTabChange: vi.fn(),
    tabs: TABS,
    paginatedQuotas: [QUOTA],
    paginatedLimits: [LIMIT_ITEM],
    uniqueQuotas: [UNIQUE_QUOTA],
    isDemoData: false,
    isFetchingData: false,
    onEditQuota: vi.fn(),
    onDeleteQuota: vi.fn(),
    onCreateQuota: vi.fn(),
    activePagination: basePagination(),
    containerRef: { current: null },
    ...overrides,
  }
  return { ...render(<NamespaceQuotasList {...props} />), props }
}

describe('NamespaceQuotasList', () => {
  it('renders the search input and forwards changes', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    renderList({ onSearchChange })

    const input = screen.getByPlaceholderText('cards:namespaceQuotas.searchQuotas')
    await user.type(input, 'a')
    expect(onSearchChange).toHaveBeenCalled()
  })

  it('shows the "All Clusters" and "All Namespaces" badges when scope is all/all', () => {
    renderList({ selectedCluster: 'all', selectedNamespace: 'all' })
    expect(screen.getByText('All Clusters')).toBeInTheDocument()
    expect(screen.getByText('cards:namespaceQuotas.allNamespaces')).toBeInTheDocument()
  })

  it('shows the demo badge when isDemoData is true', () => {
    renderList({ isDemoData: true })
    expect(screen.getByText('common:common.demo')).toBeInTheDocument()
  })

  it('switches tabs when a tab button is clicked', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    renderList({ onTabChange })

    await user.click(screen.getByRole('button', { name: /Limits/ }))
    expect(onTabChange).toHaveBeenCalledWith('limits')
  })

  it('renders a quota usage row with resource name and used/limit values', () => {
    renderList()
    expect(screen.getByText('CPU Requests')).toBeInTheDocument()
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('invokes onEditQuota / onDeleteQuota from the row actions', async () => {
    const user = userEvent.setup()
    const onEditQuota = vi.fn()
    const onDeleteQuota = vi.fn()
    renderList({ onEditQuota, onDeleteQuota })

    await user.click(screen.getByTitle('cards:namespaceQuotas.editQuota'))
    expect(onEditQuota).toHaveBeenCalledWith(UNIQUE_QUOTA)

    await user.click(screen.getByTitle('cards:namespaceQuotas.deleteQuota'))
    expect(onDeleteQuota).toHaveBeenCalledWith({ cluster: 'cluster-a', namespace: 'team-a', name: 'default-quota' })
  })

  it('renders limit range rows when the limits tab is active', () => {
    renderList({ activeTab: 'limits' })
    expect(screen.getByText('default-limits')).toBeInTheDocument()
    expect(screen.getByText('Container')).toBeInTheDocument()
  })

  it('shows the empty state with a create-quota CTA when there are no items', async () => {
    const user = userEvent.setup()
    const onCreateQuota = vi.fn()
    renderList({
      paginatedQuotas: [],
      activePagination: basePagination({ totalItems: 0 }),
      onCreateQuota,
    })

    expect(screen.getByText('cards:namespaceQuotas.noQuotas')).toBeInTheDocument()
    await user.click(screen.getByText('cards:namespaceQuotas.createGpuQuota'))
    expect(onCreateQuota).toHaveBeenCalledTimes(1)
  })
})
