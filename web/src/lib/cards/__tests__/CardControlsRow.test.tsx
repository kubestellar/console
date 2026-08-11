import React from 'react'
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Stub the child components so we can assert forwarding/composition without
// depending on their internals (which are covered by their own tests).
vi.mock('../CardClusterFilter', () => ({
  CardClusterFilter: (props: Record<string, unknown>) => (
    <div
      data-testid="cluster-filter"
      data-selected-count={
        Array.isArray(props.selectedClusters)
          ? (props.selectedClusters as unknown[]).length
          : undefined
      }
      data-available-count={
        Array.isArray(props.availableClusters)
          ? (props.availableClusters as unknown[]).length
          : undefined
      }
      data-min-clusters={String(props.minClusters ?? '')}
      data-is-open={String(props.isOpen)}
    />
  ),
  CardClusterIndicator: (props: Record<string, unknown>) => (
    <div
      data-testid="cluster-indicator"
      data-selected-count={String(props.selectedCount)}
      data-total-count={String(props.totalCount)}
    />
  ),
}))

vi.mock('../../../components/ui/CardControls', () => ({
  CardControls: (props: Record<string, unknown>) => (
    <div
      data-testid="card-controls-ui"
      data-limit={String(props.limit)}
      data-sort-by={String(props.sortBy)}
      data-sort-direction={String(props.sortDirection)}
    />
  ),
}))

import { CardControlsRow } from '../CardControlsRow'

const clusterFilter = {
  availableClusters: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
  selectedClusters: ['a'],
  onToggle: () => {},
  onClear: () => {},
  isOpen: false,
  setIsOpen: () => {},
  containerRef: { current: null },
  minClusters: 2,
}

const clusterIndicator = { selectedCount: 1, totalCount: 3 }

const cardControls = {
  limit: 10 as const,
  onLimitChange: () => {},
  sortBy: 'name',
  sortOptions: [{ value: 'name', label: 'Name' }],
  onSortChange: () => {},
  sortDirection: 'asc' as const,
  onSortDirectionChange: () => {},
}

describe('CardControlsRow', () => {
  it('renders an empty row with the canonical layout classes when no controls are provided', () => {
    const { container } = render(<CardControlsRow />)
    const row = container.firstChild as HTMLElement

    expect(row).toBeInTheDocument()
    expect(row.className).toContain('flex')
    expect(row.className).toContain('flex-wrap')
    expect(row.className).toContain('items-center')
    expect(row.className).toContain('gap-2')
    expect(row.className).toContain('mb-3')

    expect(screen.queryByTestId('cluster-filter')).toBeNull()
    expect(screen.queryByTestId('cluster-indicator')).toBeNull()
    expect(screen.queryByTestId('card-controls-ui')).toBeNull()
  })

  it('merges a custom className with the canonical classes', () => {
    const { container } = render(<CardControlsRow className="justify-end" />)
    const row = container.firstChild as HTMLElement

    expect(row.className).toContain('flex')
    expect(row.className).toContain('mb-3')
    expect(row.className).toContain('justify-end')
  })

  it('renders the cluster indicator only when provided', () => {
    render(<CardControlsRow clusterIndicator={clusterIndicator} />)

    const indicator = screen.getByTestId('cluster-indicator')
    expect(indicator.dataset.selectedCount).toBe('1')
    expect(indicator.dataset.totalCount).toBe('3')
    expect(screen.queryByTestId('cluster-filter')).toBeNull()
    expect(screen.queryByTestId('card-controls-ui')).toBeNull()
  })

  it('forwards cluster filter props to CardClusterFilter', () => {
    render(<CardControlsRow clusterFilter={clusterFilter} />)

    const filter = screen.getByTestId('cluster-filter')
    expect(filter.dataset.selectedCount).toBe('1')
    expect(filter.dataset.availableCount).toBe('3')
    expect(filter.dataset.minClusters).toBe('2')
    expect(filter.dataset.isOpen).toBe('false')
  })

  it('forwards card controls props to CardControls', () => {
    render(<CardControlsRow cardControls={cardControls} />)

    const controls = screen.getByTestId('card-controls-ui')
    expect(controls.dataset.limit).toBe('10')
    expect(controls.dataset.sortBy).toBe('name')
    expect(controls.dataset.sortDirection).toBe('asc')
  })

  it('renders the extra slot after the standard controls', () => {
    render(
      <CardControlsRow
        clusterIndicator={clusterIndicator}
        extra={<span data-testid="extra-slot">extra</span>}
      />
    )

    expect(screen.getByTestId('extra-slot')).toBeInTheDocument()
  })

  it('renders all sections together in the documented order', () => {
    const { container } = render(
      <CardControlsRow
        clusterIndicator={clusterIndicator}
        clusterFilter={clusterFilter}
        cardControls={cardControls}
        extra={<span data-testid="extra-slot">extra</span>}
      />
    )
    const row = container.firstChild as HTMLElement
    const testIds = Array.from(row.children).map((c) =>
      (c as HTMLElement).getAttribute('data-testid')
    )

    expect(testIds).toEqual([
      'cluster-indicator',
      'cluster-filter',
      'card-controls-ui',
      'extra-slot',
    ])
  })
})
