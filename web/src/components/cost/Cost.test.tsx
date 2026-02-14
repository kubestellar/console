import { describe, it, expect } from 'vitest'
import * as CostModule from './Cost'

describe('Cost Component', () => {
  it('exports Cost component', () => {
    expect(CostModule.Cost).toBeDefined()
    expect(typeof CostModule.Cost).toBe('function')
  })
})
