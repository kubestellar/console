import { describe, it, expect } from 'vitest'
import * as ResourceBadgesModule from './ResourceBadges'

describe('ResourceBadges Component', () => {
  it('exports ResourceBadges component', () => {
    expect(ResourceBadgesModule.ResourceBadges).toBeDefined()
    expect(typeof ResourceBadgesModule.ResourceBadges).toBe('function')
  })
})
