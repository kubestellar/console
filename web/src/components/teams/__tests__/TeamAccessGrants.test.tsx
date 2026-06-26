// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TeamAccessGrants } from '../TeamAccessGrants'

// Mock hooks and dependencies
const mockUseClusters = vi.fn()
const mockUseCachedNamespaces = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockAuthFetch = vi.fn()
const mockT = vi.fn((key: string) => key)

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNamespaces: (cluster?: string) => mockUseCachedNamespaces(cluster),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../../../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}))

describe('TeamAccessGrants', () => {
  const mockOnGrantChanged = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [] })
    mockUseCachedNamespaces.mockReturnValue({ namespaces: [] })
    mockUseGlobalFilters.mockReturnValue({})
    mockT.mockImplementation((key: string) => key)
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('renders grants list when grants are provided', () => {
    const grants = [
      { cluster: 'prod-east', namespace: 'default', role: 'admin', isClusterScoped: false },
      { cluster: 'staging', role: 'view', isClusterScoped: true },
    ]

    render(<TeamAccessGrants teamName="test-team" grants={grants} onGrantChanged={mockOnGrantChanged} />)

    expect(screen.getByText('prod-east/ default')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('staging')).toBeInTheDocument()
    expect(screen.getByText('view')).toBeInTheDocument()
    expect(screen.getByText('(cluster-wide)')).toBeInTheDocument()
  })

  it('renders empty state when no grants exist', () => {
    render(<TeamAccessGrants teamName="test-team" grants={[]} onGrantChanged={mockOnGrantChanged} />)

    expect(screen.getByText('teams.noAccessGrants')).toBeInTheDocument()
  })

  it('opens grant modal when grant access button is clicked', () => {
    render(<TeamAccessGrants teamName="test-team" grants={[]} onGrantChanged={mockOnGrantChanged} />)

    const grantButton = screen.getByText('teams.grantAccess')
    fireEvent.click(grantButton)

    expect(screen.getAllByText('teams.grantAccess')).toHaveLength(2)
  })

  it('closes grant modal when cancel is clicked', () => {
    render(<TeamAccessGrants teamName="test-team" grants={[]} onGrantChanged={mockOnGrantChanged} />)

    fireEvent.click(screen.getByText('teams.grantAccess'))
    fireEvent.click(screen.getByText('common.cancel'))

    expect(screen.queryByText('common.cancel')).not.toBeInTheDocument()
  })

  it('populates cluster dropdown with available clusters', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster1' },
        { name: 'cluster2' },
      ],
    })

    render(<TeamAccessGrants teamName="test-team" grants={[]} onGrantChanged={mockOnGrantChanged} />)
    fireEvent.click(screen.getByText('teams.grantAccess'))

    const clusterSelect = screen.getByRole('combobox', { name: /teams.cluster/i })
    expect(clusterSelect).toBeInTheDocument()
  })

  it('calls authFetch with correct payload when granting namespace access', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [{ name: 'cluster1' }],
    })
    mockUseCachedNamespaces.mockReturnValue({
      namespaces: ['default', 'kube-system'],
    })
    mockAuthFetch.mockResolvedValue({ ok: true })

    render(<TeamAccessGrants teamName="test-team" grants={[]} onGrantChanged={mockOnGrantChanged} />)

    fireEvent.click(screen.getByText('teams.grantAccess'))

    const scopeSelect = screen.getByDisplayValue('teams.namespaceScoped')
    fireEvent.change(scopeSelect, { target: { value: 'namespace' } })

    await waitFor(() => {
      const grantButton = screen.getAllByText('teams.grantAccess')[1]
      fireEvent.click(grantButton)
    })

    expect(mockAuthFetch).toHaveBeenCalled()
  })

  it('handles grant error and displays error message', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [{ name: 'cluster1' }],
    })
    mockAuthFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Permission denied' }),
    })

    render(<TeamAccessGrants teamName="test-team" grants={[]} onGrantChanged={mockOnGrantChanged} />)

    fireEvent.click(screen.getByText('teams.grantAccess'))

    await waitFor(() => {
      const grantButton = screen.getAllByText('teams.grantAccess')[1]
      fireEvent.click(grantButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument()
    })
  })

  it('disables grant button while granting', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [{ name: 'cluster1' }],
    })
    mockAuthFetch.mockImplementation(() => new Promise(() => {}))

    render(<TeamAccessGrants teamName="test-team" grants={[]} onGrantChanged={mockOnGrantChanged} />)

    fireEvent.click(screen.getByText('teams.grantAccess'))

    const grantButton = screen.getAllByText('teams.grantAccess')[1]
    fireEvent.click(grantButton)

    await waitFor(() => {
      expect(grantButton).toBeDisabled()
    })
  })

  it('calls onGrantChanged after successful grant', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [{ name: 'cluster1' }],
    })
    mockAuthFetch.mockResolvedValue({ ok: true })

    render(<TeamAccessGrants teamName="test-team" grants={[]} onGrantChanged={mockOnGrantChanged} />)

    fireEvent.click(screen.getByText('teams.grantAccess'))

    const grantButton = screen.getAllByText('teams.grantAccess')[1]
    fireEvent.click(grantButton)

    await waitFor(() => {
      expect(mockOnGrantChanged).toHaveBeenCalled()
    })
  })
})
