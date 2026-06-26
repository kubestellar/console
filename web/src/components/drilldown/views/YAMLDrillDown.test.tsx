import { describe, it, expect } from 'vitest'
import * as YAMLDrillDownModule from './YAMLDrillDown'

describe('YAMLDrillDown Component', () => {
  it('exports YAMLDrillDown component', () => {
    expect(YAMLDrillDownModule.YAMLDrillDown).toBeDefined()
    expect(typeof YAMLDrillDownModule.YAMLDrillDown).toBe('function')
  })
})
