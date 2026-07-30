import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GPUDashboardTab } from '../GPUDashboardTab'
import type { GPUDashboardTabProps } from '../GPUDashboardTab'
import type { GpuDashCard } from '../SortableGpuCard'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [],
  })),
}))

vi.mock('../SortableGpuCard', () => ({
  SortableGpuCard: ({ card }: { card: GpuDashCard }) => (
    <div data-testid="sortable-card" data-type={card.type} />
  ),
}))

vi.mock('../../charts/StatusIndicator', () => ({
  StatusIndicator: ({ status }: { status: string }) => (
    <span data-testid={`status-${status}`} />
  ),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  MouseSensor: vi.fn(),
  TouchSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  rectSortingStrategy: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCard(type: string): GpuDashCard {
  return { type, width: 6 }
}

function renderTab(overrides: Partial<GPUDashboardTabProps> = {}) {
  const defaults: GPUDashboardTabProps = {
    dashboardCards: [],
    dashCardIds: [],
    gpuDashSensors: [],
    gpuLiveMode: false,
    isRefreshingDashboard: false,
    onDashDragEnd: vi.fn(),
    onRemoveDashboardCard: vi.fn(),
    onDashCardWidthChange: vi.fn(),
    onTriggerRefresh: vi.fn(),
    onShowAddCardModal: vi.fn(),
  }
  return render(<GPUDashboardTab {...defaults} {...overrides} />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GPUDashboardTab', () => {
  it('renders the "Add card" button', () => {
    renderTab()
    // t() returns the key
    expect(screen.getByText('gpuReservations.dashboard.addCard')).toBeTruthy()
  })

  it('shows empty state message when no cards are present', () => {
    renderTab({ dashboardCards: [] })
    expect(screen.getByText('gpuReservations.dashboard.noCardsYet')).toBeTruthy()
  })

  it('renders a sortable card for each dashboard card', () => {
    const cards = [makeCard('gpu_overview'), makeCard('gpu_status')]
    renderTab({ dashboardCards: cards, dashCardIds: ['id-0', 'id-1'] })
    const renderedCards = screen.getAllByTestId('sortable-card')
    expect(renderedCards).toHaveLength(2)
    expect(renderedCards[0].getAttribute('data-type')).toBe('gpu_overview')
    expect(renderedCards[1].getAttribute('data-type')).toBe('gpu_status')
  })

  it('calls onShowAddCardModal when the "Add card" button is clicked', () => {
    const onShowAddCardModal = vi.fn()
    renderTab({ onShowAddCardModal })
    fireEvent.click(screen.getByText('gpuReservations.dashboard.addCard'))
    expect(onShowAddCardModal).toHaveBeenCalledTimes(1)
  })

  it('calls onShowAddCardModal when the empty-state "Add first card" button is clicked', () => {
    const onShowAddCardModal = vi.fn()
    renderTab({ dashboardCards: [], onShowAddCardModal })
    fireEvent.click(screen.getByText('gpuReservations.dashboard.addFirstCard'))
    expect(onShowAddCardModal).toHaveBeenCalledTimes(1)
  })

  it('does not show the empty state when cards are present', () => {
    const cards = [makeCard('gpu_overview')]
    renderTab({ dashboardCards: cards, dashCardIds: ['id-0'] })
    expect(screen.queryByText('gpuReservations.dashboard.noCardsYet')).toBeNull()
  })
})
