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

import * as AddCardModalModule from './AddCardModal'

describe('AddCardModal Component', () => {
  it('exports AddCardModal component', () => {
    expect(AddCardModalModule.AddCardModal).toBeDefined()
    expect(typeof AddCardModalModule.AddCardModal).toBe('function')
  })
})
