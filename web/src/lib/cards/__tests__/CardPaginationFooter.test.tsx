import React from 'react'
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock useCardType to avoid requiring CardWrapper context
vi.mock('../../../components/cards/CardWrapper', () => ({
  useCardType: () => 'test-card',
}))

// Mock analytics to observe emitCardPaginationUsed calls
const emitCardPaginationUsed = vi.fn()
vi.mock('../../analytics', () => ({
  emitCardPaginationUsed: (...args: unknown[]) => emitCardPaginationUsed(...args),
}))

// Mock Pagination — surface the props so we can assert forwarding + trigger onPageChange
vi.mock('../../../components/ui/Pagination', () => ({
  Pagination: ({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    onPageChange,
  }: {
    currentPage: number
    totalPages: number
    totalItems: number
    itemsPerPage: number
    onPageChange: (page: number) => void
  }) => (
    <div
      data-testid="pagination"
      data-current-page={currentPage}
      data-total-pages={totalPages}
      data-total-items={totalItems}
      data-items-per-page={itemsPerPage}
    >
      <button type="button" onClick={() => onPageChange(3)}>go-to-3</button>
    </div>
  ),
}))

import { CardPaginationFooter } from '../CardPaginationFooter'

describe('CardPaginationFooter', () => {
  beforeEach(() => {
    emitCardPaginationUsed.mockClear()
  })

  it('renders nothing when needsPagination is false', () => {
    const { container } = render(
      <CardPaginationFooter
        currentPage={1}
        totalPages={1}
        totalItems={3}
        itemsPerPage={10}
        needsPagination={false}
        onPageChange={vi.fn()}
      />
    )

    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('pagination')).toBeNull()
  })

  it('renders the canonical separator wrapper around the Pagination component', () => {
    const { container } = render(
      <CardPaginationFooter
        currentPage={2}
        totalPages={5}
        totalItems={47}
        itemsPerPage={10}
        needsPagination={true}
        onPageChange={vi.fn()}
      />
    )

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toBeInTheDocument()
    expect(wrapper.className).toContain('pt-2')
    expect(wrapper.className).toContain('mt-2')
    expect(wrapper.className).toContain('border-t')
    expect(screen.getByTestId('pagination')).toBeInTheDocument()
  })

  it('forwards pagination props to the underlying Pagination component', () => {
    render(
      <CardPaginationFooter
        currentPage={2}
        totalPages={5}
        totalItems={47}
        itemsPerPage={10}
        needsPagination={true}
        onPageChange={vi.fn()}
      />
    )

    const pagination = screen.getByTestId('pagination')
    expect(pagination.dataset.currentPage).toBe('2')
    expect(pagination.dataset.totalPages).toBe('5')
    expect(pagination.dataset.totalItems).toBe('47')
    expect(pagination.dataset.itemsPerPage).toBe('10')
  })

  it('emits pagination analytics and calls onPageChange when the page changes', () => {
    const onPageChange = vi.fn()
    render(
      <CardPaginationFooter
        currentPage={1}
        totalPages={5}
        totalItems={47}
        itemsPerPage={10}
        needsPagination={true}
        onPageChange={onPageChange}
      />
    )

    screen.getByText('go-to-3').click()

    expect(emitCardPaginationUsed).toHaveBeenCalledTimes(1)
    expect(emitCardPaginationUsed).toHaveBeenCalledWith(3, 5, 'test-card')

    expect(onPageChange).toHaveBeenCalledTimes(1)
    expect(onPageChange).toHaveBeenCalledWith(3)
  })
})
