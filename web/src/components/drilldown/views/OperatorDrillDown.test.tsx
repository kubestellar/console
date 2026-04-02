import { describe, it, expect } from 'vitest'
import { OperatorDrillDown } from './OperatorDrillDown'

describe('OperatorDrillDown Component', () => {
  it('exports OperatorDrillDown component', () => {
    expect(OperatorDrillDown).toBeDefined()
    expect(typeof OperatorDrillDown).toBe('function')
  })
})
