import { describe, it, expect, vi } from 'vitest'

// Mock the heavy cardRegistry to avoid loading all card bundles
vi.mock('../cards/cardRegistry', () => ({
  CARD_COMPONENTS: {},
  DEMO_DATA_CARDS: [],
  LIVE_DATA_CARDS: [],
  MODULE_MAP: {},
  CARD_SIZES: {},
  registerDynamicCardType: vi.fn(),
}))

import * as CardFactoryModalModule from './CardFactoryModal'

describe('CardFactoryModal Component', () => {
  it('exports CardFactoryModal component', () => {
    expect(CardFactoryModalModule.CardFactoryModal).toBeDefined()
    expect(typeof CardFactoryModalModule.CardFactoryModal).toBe('function')
  })
})
