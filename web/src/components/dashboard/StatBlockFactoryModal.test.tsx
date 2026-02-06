import { describe, it, expect } from 'vitest'
import * as StatBlockFactoryModalModule from './StatBlockFactoryModal'

describe('StatBlockFactoryModal Component', () => {
  it('exports StatBlockFactoryModal component', () => {
    expect(StatBlockFactoryModalModule.StatBlockFactoryModal).toBeDefined()
    expect(typeof StatBlockFactoryModalModule.StatBlockFactoryModal).toBe('function')
  })
})
