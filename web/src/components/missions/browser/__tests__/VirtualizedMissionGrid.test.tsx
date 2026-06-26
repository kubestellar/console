/**
 * VirtualizedMissionGrid unit tests
 *
 * Covers: grid/list rendering, virtualization setup, and responsive column calculation.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VirtualizedMissionGrid } from '../VirtualizedMissionGrid'

interface TestItem {
  id: string
  title: string
}

const mockItems: TestItem[] = Array.from({ length: 50 }, (_, i) => ({
  id: `item-${i}`,
  title: `Test Item ${i}`,
}))

describe('VirtualizedMissionGrid', () => {
  it('renders in grid view mode', () => {
    const renderItem = (item: TestItem) => (
      <div key={item.id} data-testid={`item-${item.id}`}>
        {item.title}
      </div>
    )

    render(
      <VirtualizedMissionGrid
        items={mockItems}
        viewMode="grid"
        renderItem={renderItem}
        maxColumns={4}
      />
    )

    // At least some items should be rendered (virtualization)
    const renderedItems = screen.queryAllByTestId(/item-item-/)
    expect(renderedItems.length).toBeGreaterThan(0)
  })

  it('renders in list view mode', () => {
    const renderItem = (item: TestItem) => (
      <div key={item.id} data-testid={`item-${item.id}`}>
        {item.title}
      </div>
    )

    render(
      <VirtualizedMissionGrid
        items={mockItems}
        viewMode="list"
        renderItem={renderItem}
        maxColumns={1}
      />
    )

    const renderedItems = screen.queryAllByTestId(/item-item-/)
    expect(renderedItems.length).toBeGreaterThan(0)
  })

  it('handles empty item list', () => {
    const renderItem = (item: TestItem) => (
      <div key={item.id}>{item.title}</div>
    )

    const { container } = render(
      <VirtualizedMissionGrid
        items={[]}
        viewMode="grid"
        renderItem={renderItem}
        maxColumns={4}
      />
    )

    expect(container.firstChild).toBeInTheDocument()
  })

  it('applies custom className to container', () => {
    const renderItem = (item: TestItem) => (
      <div key={item.id}>{item.title}</div>
    )

    const { container } = render(
      <VirtualizedMissionGrid
        items={mockItems}
        viewMode="grid"
        renderItem={renderItem}
        maxColumns={4}
        className="custom-class"
      />
    )

    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('applies custom inline style to container', () => {
    const renderItem = (item: TestItem) => (
      <div key={item.id}>{item.title}</div>
    )

    const { container } = render(
      <VirtualizedMissionGrid
        items={mockItems}
        viewMode="grid"
        renderItem={renderItem}
        maxColumns={4}
        style={{ height: '500px' }}
      />
    )

    const scrollContainer = container.firstChild as HTMLElement
    expect(scrollContainer.style.height).toBe('500px')
  })

  it('uses custom row heights', () => {
    const renderItem = (item: TestItem) => (
      <div key={item.id}>{item.title}</div>
    )

    const { container } = render(
      <VirtualizedMissionGrid
        items={mockItems}
        viewMode="grid"
        renderItem={renderItem}
        maxColumns={4}
        gridRowHeight={400}
        listRowHeight={60}
      />
    )

    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders with different maxColumns settings', () => {
    const renderItem = (item: TestItem) => (
      <div key={item.id}>{item.title}</div>
    )

    const { rerender } = render(
      <VirtualizedMissionGrid
        items={mockItems}
        viewMode="grid"
        renderItem={renderItem}
        maxColumns={2}
      />
    )

    expect(screen.queryAllByTestId(/item-item-/).length).toBeGreaterThan(0)

    rerender(
      <VirtualizedMissionGrid
        items={mockItems}
        viewMode="grid"
        renderItem={renderItem}
        maxColumns={4}
      />
    )

    expect(screen.queryAllByTestId(/item-item-/).length).toBeGreaterThan(0)
  })

  it('virtualizes large lists efficiently', () => {
    const largeItemList = Array.from({ length: 1000 }, (_, i) => ({
      id: `item-${i}`,
      title: `Test Item ${i}`,
    }))

    const renderItem = (item: TestItem) => (
      <div key={item.id} data-testid={`item-${item.id}`}>
        {item.title}
      </div>
    )

    render(
      <VirtualizedMissionGrid
        items={largeItemList}
        viewMode="grid"
        renderItem={renderItem}
        maxColumns={4}
      />
    )

    const renderedItems = screen.queryAllByTestId(/item-item-/)
    // Should render fewer items than total due to virtualization
    expect(renderedItems.length).toBeLessThan(largeItemList.length)
    expect(renderedItems.length).toBeGreaterThan(0)
  })
})
