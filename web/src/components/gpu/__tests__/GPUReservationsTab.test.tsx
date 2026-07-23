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
    user: 'test-user',
    cluster: 'test-cluster',
    namespace: 'default',
    title: 'Test Reservation',
    gpuType: 'nvidia-a100',
    count: 2,
    start_date: '2024-01-15T00:00:00Z',
    duration_hours: 24,
    purpose: 'testing',
    status: 'active',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
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
  it('renders the "New Reservation" button', () => {
    renderTab()
    expect(screen.getByText('gpuReservations.newReservation')).toBeTruthy()
  })

  it('shows empty state when no reservations are present', () => {
    renderTab({ filteredReservations: [] })
    expect(screen.getByText('gpuReservations.noReservationsYet')).toBeTruthy()
  })

  it('renders reservation cards when reservations are present', () => {
    const reservations = [makeReservation(), makeReservation({ id: 'test-id-2', title: 'Second Reservation' })]
    renderTab({ filteredReservations: reservations })
    expect(screen.getAllByTestId('cluster-badge')).toHaveLength(2)
  })

  it('calls onCreateReservation when the "New Reservation" button is clicked', () => {
    const onCreateReservation = vi.fn()
    renderTab({ onCreateReservation })
    fireEvent.click(screen.getByText('gpuReservations.newReservation'))
    expect(onCreateReservation).toHaveBeenCalledTimes(1)
  })

  it('calls onSetSearchTerm when typing in the search field', () => {
    const onSetSearchTerm = vi.fn()
    renderTab({ onSetSearchTerm })
    const searchInput = screen.getByPlaceholderText('gpuReservations.searchPlaceholder')
    fireEvent.change(searchInput, { target: { value: 'test' } })
    expect(onSetSearchTerm).toHaveBeenCalledWith('test')
  })

  it('calls onSetShowOnlyMine when the "My Reservations" filter is toggled', () => {
    const onSetShowOnlyMine = vi.fn()
    renderTab({ onSetShowOnlyMine, user: { github_login: 'test-user' } })
    fireEvent.click(screen.getByText('gpuReservations.myReservations'))
    expect(onSetShowOnlyMine).toHaveBeenCalledWith(true)
  })

  it('shows loading skeleton when reservationsLoading is true', () => {
    renderTab({ reservationsLoading: true })
    expect(screen.getByText('gpuReservations.loadingReservations')).toBeTruthy()
  })

  it('calls onEditReservation when the edit button is clicked', () => {
    const onEditReservation = vi.fn()
    const reservation = makeReservation()
    renderTab({ filteredReservations: [reservation], onEditReservation })
    const editButton = screen.getByLabelText('gpuReservations.editReservation')
    fireEvent.click(editButton)
    expect(onEditReservation).toHaveBeenCalledWith(reservation)
  })
})
