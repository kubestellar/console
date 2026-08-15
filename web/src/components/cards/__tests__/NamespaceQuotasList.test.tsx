import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceQuotasList } from '../NamespaceQuotasList'
import type { QuotaUsage, LimitRangeItem, TabKey, QuotaDeleteTarget } from '../NamespaceQuotas.types'
import type { ResourceQuota } from '../../../hooks/useMCP'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const withoutNs = key.includes(':') ? key.split(':')[1] : key
      const parts = withoutNs.split('.')
      return fallback ?? parts[parts.length - 1]
    },
  }),
}))

const makeQuota = (overrides: Partial<QuotaUsage> = {}): QuotaUsage => ({
  resource: 'requests.cpu',
  rawResource: 'requests.cpu',
  used: '2',
  limit: '4',
  percent: 50,
  cluster: 'cluster-1',
  namespace: 'default',
  quotaName: 'my-quota',
  ...overrides,
})

const makeLimit = (overrides: Partial<LimitRangeItem> = {}): LimitRangeItem => ({
  name: 'my-limitrange',
  type: 'Container',
  limits: { type: 'Container', max: { cpu: '2' } },
  cluster: 'cluster-1',
  namespace: 'default',
  ...overrides,
})

const activePagination = {
  currentPage: 1,
  totalPages: 1,
  totalItems: 1,
  itemsPerPage: 10,
  goToPage: vi.fn(),
  needsPagination: false,
}

function renderList(overrides: Partial<React.ComponentProps<typeof NamespaceQuotasList>> = {}) {
  const onSearchChange = vi.fn()
  const onTabChange = vi.fn()
  const onEditQuota = vi.fn()
  const onDeleteQuota = vi.fn()
  const onCreateQuota = vi.fn()
  const props: React.ComponentProps<typeof NamespaceQuotasList> = {
    searchValue: '',
    onSearchChange,
    selectedCluster: 'cluster-1',
    selectedNamespace: 'default',
    activeTab: 'quotas',
    onTabChange,
    tabs: [
      { key: 'quotas' as TabKey, label: 'Quotas', count: 1 },
      { key: 'limits' as TabKey, label: 'Limit Ranges', count: 1 },
    ],
    paginatedQuotas: [makeQuota()],
    paginatedLimits: [makeLimit()],
    uniqueQuotas: [
      { cluster: 'cluster-1', namespace: 'default', name: 'my-quota', hard: {} } as ResourceQuota,
    ],
    isDemoData: false,
    isFetchingData: false,
    onEditQuota,
    onDeleteQuota,
    onCreateQuota,
    activePagination,
    containerRef: { current: null },
    ...overrides,
  }
  return { onSearchChange, onTabChange, onEditQuota, onDeleteQuota, onCreateQuota, ...render(<NamespaceQuotasList {...props} />) }
}

describe('NamespaceQuotasList', () => {
  it('renders quota rows with usage percentage', () => {
    renderList()
    expect(screen.getByText('requests.cpu')).toBeInTheDocument()
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('renders limit range rows when activeTab is limits', () => {
    renderList({ activeTab: 'limits' })
    expect(screen.getByText('my-limitrange')).toBeInTheDocument()
  })

  it('shows the demo badge when isDemoData is true', () => {
    renderList({ isDemoData: true })
    expect(screen.getByText('demo')).toBeInTheDocument()
  })

  it('shows skeleton placeholders while fetching with no data yet', () => {
    const { container } = renderList({
      isFetchingData: true,
      paginatedQuotas: [],
      activePagination: { ...activePagination, totalItems: 0 },
    })
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3)
  })

  it('shows an empty state with a create-quota action when there are no quotas', () => {
    const { onCreateQuota } = renderList({
      paginatedQuotas: [],
      activePagination: { ...activePagination, totalItems: 0 },
    })
    const createButton = screen.getByText('createGpuQuota')
    expect(createButton).toBeInTheDocument()
  })

  it('calls onTabChange when a tab is clicked', async () => {
    const user = userEvent.setup()
    const { onTabChange } = renderList()
    await user.click(screen.getByText('Limit Ranges'))
    expect(onTabChange).toHaveBeenCalledWith('limits')
  })

  it('calls onEditQuota and onDeleteQuota via row actions', async () => {
    const user = userEvent.setup()
    const { onEditQuota, onDeleteQuota } = renderList({ selectedCluster: 'all' })
    await user.click(screen.getByTitle('editQuota'))
    expect(onEditQuota).toHaveBeenCalled()
    await user.click(screen.getByTitle('deleteQuota'))
    expect(onDeleteQuota).toHaveBeenCalledWith(
      expect.objectContaining({ cluster: 'cluster-1', namespace: 'default', name: 'my-quota' } as QuotaDeleteTarget)
    )
  })
})
