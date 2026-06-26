import { describe, it, expect } from 'vitest'
import { AlertBadge, AnimatedCounter } from './AlertBadge'

describe('AlertBadge Component', () => {
  it('exports AlertBadge component', () => {
    expect(AlertBadge).toBeDefined()
    expect(typeof AlertBadge).toBe('function')
  })

  it('exports AnimatedCounter component', () => {
    expect(AnimatedCounter).toBeDefined()
    expect(typeof AnimatedCounter).toBe('function')
  })
})
