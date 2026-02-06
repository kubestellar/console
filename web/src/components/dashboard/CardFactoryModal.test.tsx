import { describe, it, expect } from 'vitest'
import * as CardFactoryModalModule from './CardFactoryModal'

describe('CardFactoryModal Component', () => {
  it('exports CardFactoryModal component', () => {
    expect(CardFactoryModalModule.CardFactoryModal).toBeDefined()
    expect(typeof CardFactoryModalModule.CardFactoryModal).toBe('function')
  })
})
