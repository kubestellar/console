import { describe, it, expect, vi } from 'vitest'

// Mock the heavy cardRegistry (pulled in transitively via CardFactoryModal)
vi.mock('../cards/cardRegistry', () => ({
  CARD_COMPONENTS: {},
  DEMO_DATA_CARDS: [],
  LIVE_DATA_CARDS: [],
  MODULE_MAP: {},
  CARD_SIZES: {},
  registerDynamicCardType: vi.fn(),
}))

import { AddCardModal } from './AddCardModal'

describe('AddCardModal Component', () => {
  it('exports AddCardModal component', () => {
    expect(AddCardModal).toBeDefined()
    expect(typeof AddCardModal).toBe('function')
  })
})
