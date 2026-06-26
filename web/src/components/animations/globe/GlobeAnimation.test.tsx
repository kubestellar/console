import { describe, it, expect } from 'vitest'
import GlobeAnimation from './GlobeAnimation'

describe('GlobeAnimation Component', () => {
  it('exports GlobeAnimation component as default', () => {
    expect(GlobeAnimation).toBeDefined()
    expect(typeof GlobeAnimation).toBe('function')
  })
})
