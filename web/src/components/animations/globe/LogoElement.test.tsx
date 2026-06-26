import { describe, it, expect } from 'vitest'
import LogoElement from './LogoElement'

describe('LogoElement Component', () => {
  it('exports LogoElement component as default', () => {
    expect(LogoElement).toBeDefined()
    expect(typeof LogoElement).toBe('function')
  })
})
