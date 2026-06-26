import { describe, it, expect } from 'vitest'
import NetworkGlobe from './NetworkGlobe'

describe('NetworkGlobe Component', () => {
  it('exports NetworkGlobe component as default', () => {
    expect(NetworkGlobe).toBeDefined()
    expect(typeof NetworkGlobe).toBe('function')
  })
})
