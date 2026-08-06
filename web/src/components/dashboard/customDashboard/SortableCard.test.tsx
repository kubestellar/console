import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  }),
}))

vi.mock('../../cards/CardWrapper', () => ({
  CardWrapper: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../cards/cardRegistry', () => ({
  CARD_COMPONENTS: {},
  DEMO_DATA_CARDS: new Set<string>(),
  LIVE_DATA_CARDS: new Set<string>(),
}))

vi.mock('../../../lib/cards/cardHooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/cards/cardHooks')>()
  return {
    ...actual,
    useCardCollapse: () => ({ isExpanded: false }),
  }
})

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => {} },
  }
})

import { SortableCard } from './SortableCard'

describe('SortableCard Component', () => {
  it('exports SortableCard component', () => {
    expect(SortableCard).toBeDefined()
    expect(typeof SortableCard).toBe('function')
  })

  it('renders with required props', () => {
    const card = { id: 'test-1', title: 'Test', width: 6, height: 2 }
    expect(() => render(<SortableCard {...{
        card,
        onConfigure: vi.fn(),
        onRemove: vi.fn(),
        onWidthChange: vi.fn(),
        onHeightChange: vi.fn(),
      }} />)).not.toThrow()
  })
})
