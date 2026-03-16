import { describe, it, expect } from 'vitest'
import { SimpleGlobe } from './SimpleGlobe'

describe('SimpleGlobe Component', () => {
  it('exports SimpleGlobe component', () => {
    expect(SimpleGlobe).toBeDefined()
    expect(typeof SimpleGlobe).toBe('function')
  })
})
