import { describe, it, expect } from 'vitest'
import { CardSearch } from './CardSearch'

describe('CardSearch Component', () => {
  it('exports CardSearch component', () => {
    expect(CardSearch).toBeDefined()
    expect(typeof CardSearch).toBe('function')
  })
})
