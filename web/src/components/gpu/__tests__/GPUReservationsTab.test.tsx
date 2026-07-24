import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GPUReservationsTab } from '../GPUReservationsTab'
import type { GPUReservationsTabProps } from '../GPUReservationsTab'
import type { GPUReservation } from '../../../hooks/useGPUReservations'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../../charts/Sparkline', () => ({
  Sparkline: ({ data }: { data: number[] }) => (
    <div data-testid="sparkline" data-points={data.length} />
  ),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReservation(overrides: Partial<GPUReservation> = {}): GPUReservation {
  return {
    id: 'test-id',
    user_id: 'test-user-id',
    user_name: 'test-user',
    cluster: 'test-cluster',
    namespace: 'default',
    title: 'Test Reservation',
    description: '',
    gpu_type: 'nvidia-a100',
    gpu_count: 2,
    start_date: '2024-01-15T00:00:00Z',
    duration_hours: 24,
    notes: '',
    status: 'active',
    quota_name: '',
    quota_enforced: false,
    created_at: '2024-01-15T00:00:00Z',
    ...overrides,
  }
}

function renderTab(overrides: Partial<GPUReservationsTabProps> = {}) {
  const defaults: GPUReservationsTabProps = {
    filteredReservations: [],
    utilizations: null,
    effectiveDemoMode: false,
    showOnlyMine: false,
    searchTerm: '',
    reservationsLoading: false,
    expandedReservationId: null,
    deleteConfirmId: null,
    showReservationForm: false,
    user: null,
    onSetSearchTerm: vi.fn(),
    onSetShowOnlyMine: vi.fn(),
    onSetExpandedReservationId: vi.fn(),
    onEditReservation: vi.fn(),
    onDeleteReservation: vi.fn(),
    onCreateReservation: vi.fn(),
  }
  return render(<GPUReservationsTab {...defaults} {...overrides} />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GPUReservationsTab', () => {
  it('renders the "Create Reservation" button in empty state', () => {
    renderTab()
    expect(screen.getByText('gpuReservations.createReservation')).toBeTruthy()
  })

  it('shows empty state when no reservations are present', () => {
    renderTab({ filteredReservations: [] })
    expect(screen.getByText('gpuReservations.overview.noReservationsYetShort')).toBeTruthy()
  })

  it('renders reservation cards when reservations are present', () => {
    const reservations = [makeReservation(), makeReservation({ id: 'test-id-2', title: 'Second Reservation' })]
    renderTab({ filteredReservations: reservations })
    expect(screen.getAllByTestId('cluster-badge')).toHaveLength(2)
  })

  it('calls onCreateReservation when the "Create Reservation" button is clicked', () => {
    const onCreateReservation = vi.fn()
    renderTab({ onCreateReservation })
    fireEvent.click(screen.getByText('gpuReservations.createReservation'))
    expect(onCreateReservation).toHaveBeenCalledTimes(1)
  })

  it('calls onSetSearchTerm when typing in the search field', () => {
    const onSetSearchTerm = vi.fn()
    renderTab({ onSetSearchTerm })
    // The component renders t('gpuReservations.searchPlaceholder', 'Search reservations...')
    // which resolves to the fallback string in the test i18n mock.
    const searchInput = screen.getByPlaceholderText('Search reservations...')
    fireEvent.change(searchInput, { target: { value: 'test' } })
    expect(onSetSearchTerm).toHaveBeenCalledWith('test')
  })

  it('calls onSetShowOnlyMine(false) when the clear filter button is clicked', () => {
    const onSetShowOnlyMine = vi.fn()
    // showOnlyMine=true causes the filter banner with a "Clear filter" button to appear
    renderTab({ onSetShowOnlyMine, showOnlyMine: true, user: { github_login: 'test-user' } })
    // The button label comes from t('common:common.clearFilter', 'Clear filter') → 'Clear filter'
    fireEvent.click(screen.getByText('Clear filter'))
    expect(onSetShowOnlyMine).toHaveBeenCalledWith(false)
  })

  it('hides empty state when reservationsLoading is true', () => {
    renderTab({ reservationsLoading: true, filteredReservations: [] })
    // When loading, the empty-state block is suppressed (condition: length===0 && !reservationsLoading)
    expect(screen.queryByText('gpuReservations.overview.noReservationsYetShort')).not.toBeInTheDocument()
  })

  it('calls onEditReservation when the edit button is clicked', () => {
    const onEditReservation = vi.fn()
    const reservation = makeReservation()
    renderTab({ filteredReservations: [reservation], onEditReservation })
    // aria-label comes from t('gpuReservations.list.editReservation', { title }) → key string
    const editButton = screen.getByLabelText('gpuReservations.list.editReservation')
    fireEvent.click(editButton)
    expect(onEditReservation).toHaveBeenCalledWith(reservation)
  })
})
