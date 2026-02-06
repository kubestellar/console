import { describe, it, expect } from 'vitest'
import * as DrillDownModalModule from './DrillDownModal'

describe('DrillDownModal Component', () => {
  it('exports DrillDownModal component', () => {
    expect(DrillDownModalModule.DrillDownModal).toBeDefined()
    expect(typeof DrillDownModalModule.DrillDownModal).toBe('function')
  })
})
