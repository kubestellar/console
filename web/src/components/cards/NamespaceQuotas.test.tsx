import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceQuotas } from './NamespaceQuotas'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, optsOrFallback?: Record<string, unknown> | string, extraOpts?: Record<string, unknown>) => {
      const options = typeof optsOrFallback === 'object' ? optsOrFallback : extraOpts
      const fallback = typeof optsOrFallback === 'string' ? optsOrFallback : undefined
      if (options && typeof options === 'object' && 'count' in options) return `${options.count}`
      if (fallback) return fallback
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

const mockUseClusters = vi.fn()
const mockUseResourceQuotas = vi.fn()
const mockUseLimitRanges = vi.fn()
const mockCreateOrUpdateResourceQuota = vi.fn()
const mockDeleteResourceQuota = vi.fn()

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
  useResourceQuotas: (c?: string, ns?: string) => mockUseResourceQuotas(c, ns),
  useLimitRanges: (c?: string, ns?: string) => mockUseLimitRanges(c, ns),
  createOrUpdateResourceQuota: (spec: unknown) => mockCreateOrUpdateResourceQuota(spec),
  deleteResourceQuota: (cluster: string, namespace: string, name: string) => mockDeleteResourceQuota(cluster, namespace, name),
  COMMON_RESOURCE_TYPES: [
    { key: 'requests.cpu', label: 'CPU Requests', description: 'Total CPU requests allowed' },
    { key: 'limits.memory', label: 'Memory Limits', description: 'Total memory limits allowed' },
    { key: 'pods', label: 'Pods', description: 'Maximum number of pods' },
  ],
  GPU_RESOURCE_TYPES: [
    { key: 'limits.nvidia.com/gpu', label: 'NVIDIA GPU Limits', description: 'Maximum GPU limits allowed' },
  ],
}))

const mockUseCachedNamespaces = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedNamespaces: (cluster?: string) => mockUseCachedNamespaces(cluster),
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../hooks/useDemoMode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useDemoMode')>()
  return {
    ...actual,
    useDemoMode: () => mockUseDemoMode(),
  }
})

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

function setupMocks(overrides: {
  clusters?: Array<Record<string, unknown>>
  clustersLoading?: boolean
  clustersFailed?: boolean
  clustersFailures?: number
  resourceQuotas?: Array<Record<string, unknown>>
  quotasLoading?: boolean
  limitRanges?: Array<Record<string, unknown>>
  limitsLoading?: boolean
  namespaces?: string[]
  namespacesLoading?: boolean
  isDemoMode?: boolean
  isDemoFallback?: boolean
  showSkeleton?: boolean
  showEmptyState?: boolean
} = {}) {
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: overrides.clusters ?? [{ name: 'cluster-1' }, { name: 'cluster-2' }],
    isLoading: overrides.clustersLoading ?? false,
    isRefreshing: false,
    isFailed: overrides.clustersFailed ?? false,
    consecutiveFailures: overrides.clustersFailures ?? 0,
  })

  mockUseResourceQuotas.mockReturnValue({
    resourceQuotas: overrides.resourceQuotas ?? [
      {
        name: 'quota-1',
        namespace: 'namespace-1',
        cluster: 'cluster-1',
        hard: { 'requests.cpu': '10', 'requests.memory': '20Gi', pods: '50' },
        used: { 'requests.cpu': '5', 'requests.memory': '10Gi', pods: '25' },
        age: '30d',
      }
    ],
    isLoading: overrides.quotasLoading ?? false,
    error: null,
    refetch: vi.fn(),
    isDemoFallback: overrides.isDemoFallback ?? false,
  })

  mockUseLimitRanges.mockReturnValue({
    limitRanges: overrides.limitRanges ?? [
      {
        name: 'limits-1',
        namespace: 'namespace-1',
        cluster: 'cluster-1',
        limits: [
          {
            type: 'Container',
            default: { cpu: '500m', memory: '512Mi' },
            defaultRequest: { cpu: '100m', memory: '128Mi' },
            max: { cpu: '2', memory: '4Gi' },
            min: { cpu: '50m', memory: '64Mi' }
          }
        ]
      }
    ],
    isLoading: overrides.limitsLoading ?? false,
    error: null,
    refetch: vi.fn(),
  })

  mockUseCachedNamespaces.mockReturnValue({
    namespaces: overrides.namespaces ?? ['namespace-1', 'namespace-2'],
    isLoading: overrides.namespacesLoading ?? false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
  })

  mockUseDemoMode.mockReturnValue({
    isDemoMode: overrides.isDemoMode ?? false,
  })

  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: overrides.showSkeleton ?? false,
    showEmptyState: overrides.showEmptyState ?? false,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NamespaceQuotas Card Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('renders quota rows with correct CPU, memory, and pod usage as percentages', () => {
    render(<NamespaceQuotas />)
    expect(screen.getByText('CPU')).toBeInTheDocument()
    expect(screen.getByText('Memory')).toBeInTheDocument()
    expect(screen.getByText('Pods')).toBeInTheDocument()

    // 5 used / 10 limit -> 50%
    // 10Gi used / 20Gi limit -> 50%
    // 25 used / 50 limit -> 50%
    const percentages = screen.getAllByText('50%')
    expect(percentages.length).toBe(3)
  })

  it('handles used=0, limit=100 showing 0% correctly (no divide-by-zero crash)', () => {
    setupMocks({
      resourceQuotas: [
        {
          name: 'quota-zero',
          namespace: 'namespace-1',
          cluster: 'cluster-1',
          hard: { 'requests.cpu': '100' },
          used: { 'requests.cpu': '0' },
          age: '1d',
        }
      ]
    })
    render(<NamespaceQuotas />)
    expect(screen.getByText('CPU')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('handles used > limit showing over-quota indicator/warning state correctly (>100%)', () => {
    setupMocks({
      resourceQuotas: [
        {
          name: 'quota-over',
          namespace: 'namespace-1',
          cluster: 'cluster-1',
          hard: { 'requests.cpu': '10' },
          used: { 'requests.cpu': '15' },
          age: '1d',
        }
      ]
    })
    render(<NamespaceQuotas />)
    expect(screen.getByText('CPU')).toBeInTheDocument()
    expect(screen.getByText('150%')).toBeInTheDocument()
  })

  it('filters visible quotas by selected cluster via cluster selector dropdown', async () => {
    setupMocks({
      resourceQuotas: [
        {
          name: 'quota-1',
          namespace: 'namespace-1',
          cluster: 'cluster-1',
          hard: { 'requests.cpu': '10' },
          used: { 'requests.cpu': '5' },
        },
        {
          name: 'quota-2',
          namespace: 'namespace-2',
          cluster: 'cluster-2',
          hard: { 'requests.cpu': '10' },
          used: { 'requests.cpu': '2' },
        }
      ]
    })
    render(<NamespaceQuotas />)

    // Both cluster namespaces are listed initially (All Clusters)
    expect(screen.getByText('namespace-1')).toBeInTheDocument()
    expect(screen.getByText('namespace-2')).toBeInTheDocument()

    const selects = screen.getAllByRole('combobox')
    const clusterSelect = selects[0]

    // Select cluster-1
    await userEvent.selectOptions(clusterSelect, 'cluster-1')
    expect(screen.getAllByText('namespace-1').length).toBeGreaterThan(0)
    expect(screen.queryByText('20%')).not.toBeInTheDocument()
  })

  it('filters visible quotas by selected namespace via namespace selector dropdown', async () => {
    setupMocks({
      resourceQuotas: [
        {
          name: 'quota-1',
          namespace: 'namespace-1',
          cluster: 'cluster-1',
          hard: { 'requests.cpu': '10' },
          used: { 'requests.cpu': '5' },
        },
        {
          name: 'quota-2',
          namespace: 'namespace-2',
          cluster: 'cluster-1',
          hard: { 'requests.cpu': '10' },
          used: { 'requests.cpu': '2' },
        }
      ]
    })
    render(<NamespaceQuotas />)

    const selects = screen.getAllByRole('combobox')
    const clusterSelect = selects[0]
    const namespaceSelect = selects[1]

    // First select cluster-1 so that namespace dropdown is active
    await userEvent.selectOptions(clusterSelect, 'cluster-1')
    expect(screen.getAllByText('namespace-1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('namespace-2').length).toBeGreaterThan(0)

    // Select namespace-1
    await userEvent.selectOptions(namespaceSelect, 'namespace-1')
    expect(screen.getAllByText('namespace-1').length).toBeGreaterThan(0)
    expect(screen.queryByText('20%')).not.toBeInTheDocument()
  })

  it('calls create callback with correct payload on creating a new quota', async () => {
    mockCreateOrUpdateResourceQuota.mockResolvedValueOnce({
      name: 'new-quota',
      namespace: 'namespace-1',
      cluster: 'cluster-1',
      hard: { 'limits.nvidia.com/gpu': '4' },
      used: { 'limits.nvidia.com/gpu': '0' },
    })

    render(<NamespaceQuotas />)

    // Click "addQuota" button
    const addBtn = screen.getByRole('button', { name: /addQuota/i })
    await userEvent.click(addBtn)

    // Modal is opened
    expect(screen.getByText('createQuota')).toBeInTheDocument()

    // Find selects in the modal by option text
    const allSelects = screen.getAllByRole('combobox')
    const clusterSelect = allSelects.find(s =>
      Array.from((s as HTMLSelectElement).options).some(o => o.text.includes('selectCluster'))
    )
    const namespaceSelect = allSelects.find(s =>
      Array.from((s as HTMLSelectElement).options).some(o => o.text.includes('selectNamespace'))
    )

    expect(clusterSelect).toBeDefined()
    expect(namespaceSelect).toBeDefined()

    await userEvent.selectOptions(clusterSelect!, 'cluster-1')
    await userEvent.selectOptions(namespaceSelect!, 'namespace-1')

    const nameInput = screen.getByPlaceholderText('quotaNamePlaceholder')
    await userEvent.type(nameInput, 'new-quota')

    // Submit form
    const createSubmitBtn = screen.getByRole('button', { name: /^create$/i })
    await userEvent.click(createSubmitBtn)

    expect(mockCreateOrUpdateResourceQuota).toHaveBeenCalledWith({
      cluster: 'cluster-1',
      namespace: 'namespace-1',
      name: 'new-quota',
      hard: {
        'limits.nvidia.com/gpu': '4'
      }
    })
  })

  it('calls update callback with changed values on editing a quota', async () => {
    setupMocks({
      resourceQuotas: [
        {
          name: 'quota-1',
          namespace: 'namespace-1',
          cluster: 'cluster-1',
          hard: { 'requests.cpu': '10' },
          used: { 'requests.cpu': '5' },
          age: '30d',
        }
      ]
    })
    mockCreateOrUpdateResourceQuota.mockResolvedValueOnce({})

    render(<NamespaceQuotas />)

    // Click pencil icon (Edit quota)
    const editBtn = screen.getAllByTitle('editQuota')[0]
    await userEvent.click(editBtn)

    // Modal should open with edit state
    expect(screen.getByText('editQuota')).toBeInTheDocument()

    // Change limit value (first limit input has placeholder 'e.g., 4, 8Gi' and initial value '10')
    const valueInputs = screen.getAllByPlaceholderText('e.g., 4, 8Gi')
    const valueInput = valueInputs[0]
    expect(valueInput).toBeDefined()
    await userEvent.clear(valueInput)
    await userEvent.type(valueInput, '20')

    // Submit form
    const updateSubmitBtn = screen.getByRole('button', { name: /^update$/i })
    await userEvent.click(updateSubmitBtn)

    expect(mockCreateOrUpdateResourceQuota).toHaveBeenCalledWith(expect.objectContaining({
      cluster: 'cluster-1',
      namespace: 'namespace-1',
      name: 'quota-1',
      hard: expect.objectContaining({
        'requests.cpu': '20'
      })
    }))
  })

  it('calls delete callback with correct resource identifier when deleting a quota', async () => {
    mockDeleteResourceQuota.mockResolvedValueOnce({})

    render(<NamespaceQuotas />)

    // Click trash icon (Delete quota)
    const deleteBtn = screen.getAllByTitle('deleteQuota')[0]
    await userEvent.click(deleteBtn)

    // Confirm deletion dialog opens
    expect(screen.getByText('Delete ResourceQuota?')).toBeInTheDocument()

    // Click Confirm Delete button
    const confirmBtn = screen.getByRole('button', { name: /^delete$/i })
    await userEvent.click(confirmBtn)

    expect(mockDeleteResourceQuota).toHaveBeenCalledWith('cluster-1', 'namespace-1', 'quota-1')
  })

  it('shows skeleton loading state when isLoading is true', () => {
    setupMocks({ clustersLoading: true, showSkeleton: true })
    render(<NamespaceQuotas />)

    // Verify 6 skeletons are rendered (1 title, 1 button, 1 filter row, 3 item skeletons)
    const skeletons = screen.getAllByTestId('skeleton')
    expect(skeletons.length).toBe(6)
  })

  it('reports isDemoData: true to useCardLoadingState when isDemoMode is true', () => {
    setupMocks({ isDemoMode: true })
    render(<NamespaceQuotas />)

    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isDemoData: true })
    )
  })
})
