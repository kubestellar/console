import { describe, it, expect } from 'vitest'
import * as OperatorDrillDownModule from './OperatorDrillDown'

describe('OperatorDrillDown Component', () => {
  it('exports OperatorDrillDown component', () => {
    expect(OperatorDrillDownModule.OperatorDrillDown).toBeDefined()
    expect(typeof OperatorDrillDownModule.OperatorDrillDown).toBe('function')
  })
})
