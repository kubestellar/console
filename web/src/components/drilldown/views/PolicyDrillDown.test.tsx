import { describe, it, expect } from 'vitest'
import * as PolicyDrillDownModule from './PolicyDrillDown'

describe('PolicyDrillDown Component', () => {
  it('exports PolicyDrillDown component', () => {
    expect(PolicyDrillDownModule.PolicyDrillDown).toBeDefined()
    expect(typeof PolicyDrillDownModule.PolicyDrillDown).toBe('function')
  })
})
