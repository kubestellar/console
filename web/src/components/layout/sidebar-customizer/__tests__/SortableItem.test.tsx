import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { SidebarItem } from '../../../../hooks/useSidebarConfig'

const mockUseSortable = vi.fn()

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: (args: unknown) => mockUseSortable(args),
}))

import { SortableItem } from '../SortableItem'

const baseItem: SidebarItem = {
  id: 'deploy',
  name: 'Deployments',
  icon: 'Rocket',
  href: '/deploy',
  type: 'link',
  order: 1,
}

describe('SortableItem', () => {
  beforeEach(() => {
    mockUseSortable.mockReturnValue({
      attributes: { 'data-sortable': 'true' },
      listeners: { onPointerDown: vi.fn() },
      setNodeRef: vi.fn(),
      transform: null,
      transition: 'transform 150ms ease',
      isDragging: false,
    })
  })

  it('renders the item details and drag affordances', () => {
    render(
      <SortableItem
        item={baseItem}
        onRemove={vi.fn()}
        renderIcon={(iconName, className) => <span data-testid={iconName} className={className} />}
      />
    )

    expect(screen.getByText('Deployments')).toBeInTheDocument()
    expect(screen.getByText('/deploy')).toBeInTheDocument()
  })

  it('removes non-root items when the remove button is clicked', () => {
    const onRemove = vi.fn()

    render(
      <SortableItem
        item={baseItem}
        onRemove={onRemove}
        renderIcon={(iconName, className) => <span data-testid={iconName} className={className} />}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.removeFromSidebar' }))

    expect(onRemove).toHaveBeenCalledWith('deploy')
  })

  it('hides the remove button for the home route', () => {
    render(
      <SortableItem
        item={{ ...baseItem, id: 'home', href: '/' }}
        onRemove={vi.fn()}
        renderIcon={(iconName, className) => <span data-testid={iconName} className={className} />}
      />
    )

    expect(screen.queryByRole('button', { name: 'sidebar.removeFromSidebar' })).not.toBeInTheDocument()
  })
})
