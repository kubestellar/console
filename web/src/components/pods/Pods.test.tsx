import { describe, it, expect } from 'vitest'
import * as PodsModule from './Pods'

describe('Pods Component', () => {
  it('exports Pods component', () => {
    expect(PodsModule.Pods).toBeDefined()
    expect(typeof PodsModule.Pods).toBe('function')
  })
})
