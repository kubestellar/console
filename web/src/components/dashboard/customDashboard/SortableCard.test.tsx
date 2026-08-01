import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  }),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardCollapse: () => ({ isExpanded: false }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: {},
}))

import { SortableCard } from './SortableCard'

describe('SortableCard Component', () => {
  it('exports SortableCard component', () => {
    expect(SortableCard).toBeDefined()
    expect(typeof SortableCard).toBe('function')
  })

  it('renders with required props', () => {
    const card = { id: 'test-1', title: 'Test', width: 6, height: 2 }
    expect(() => {
      render(<SortableCard
        card={card}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
      />)
    }).not.toThrow()
  })
})
