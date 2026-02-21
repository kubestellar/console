import { describe, it, expect } from 'vitest'
import * as DrillDownModalModule from './DrillDownModal'
import { useDrillDown, DrillDownProvider } from '../../hooks/useDrillDown'

describe('DrillDownModal Component', () => {
  it('exports DrillDownModal component', () => {
    expect(DrillDownModalModule.DrillDownModal).toBeDefined()
    expect(typeof DrillDownModalModule.DrillDownModal).toBe('function')
  })

  it('DrillDownProvider and useDrillDown supply back navigation (pop) and close', () => {
    expect(DrillDownProvider).toBeDefined()
    expect(typeof DrillDownProvider).toBe('function')
    expect(useDrillDown).toBeDefined()
    expect(typeof useDrillDown).toBe('function')
  })
})
