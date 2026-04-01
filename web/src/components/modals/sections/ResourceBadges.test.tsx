import { describe, it, expect } from 'vitest'
import { ResourceBadges } from './ResourceBadges'

describe('ResourceBadges Component', () => {
  it('exports ResourceBadges component', () => {
    expect(ResourceBadges).toBeDefined()
    expect(typeof ResourceBadges).toBe('function')
  })
})
