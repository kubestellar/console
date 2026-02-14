import { describe, it, expect } from 'vitest'
import * as CardSearchModule from './CardSearch'

describe('CardSearch Component', () => {
  it('exports CardSearch component', () => {
    expect(CardSearchModule.CardSearch).toBeDefined()
    expect(typeof CardSearchModule.CardSearch).toBe('function')
  })
})
