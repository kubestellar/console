import { describe, it, expect } from 'vitest'
import * as SimpleGlobeModule from './SimpleGlobe'

describe('SimpleGlobe Component', () => {
  it('exports SimpleGlobe component', () => {
    expect(SimpleGlobeModule.SimpleGlobe).toBeDefined()
    expect(typeof SimpleGlobeModule.SimpleGlobe).toBe('function')
  })
})
