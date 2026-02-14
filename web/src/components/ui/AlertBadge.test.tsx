import { describe, it, expect } from 'vitest'
import * as AlertBadgeModule from './AlertBadge'

describe('AlertBadge Component', () => {
  it('exports AlertBadge component', () => {
    expect(AlertBadgeModule.AlertBadge).toBeDefined()
    expect(typeof AlertBadgeModule.AlertBadge).toBe('function')
  })

  it('exports AnimatedCounter component', () => {
    expect(AlertBadgeModule.AnimatedCounter).toBeDefined()
    expect(typeof AlertBadgeModule.AnimatedCounter).toBe('function')
  })
})
