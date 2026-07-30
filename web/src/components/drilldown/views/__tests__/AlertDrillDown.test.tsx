import React from 'react'
/**
 * AlertDrillDown Component Tests
 * 
 * Note: Back navigation for drill-down views is provided by DrillDownModal
 * and is tested in DrillDownModal.test.tsx (pop, goTo, close functions).
 */
import { describe, it, expect } from 'vitest'
import * as mod from '../AlertDrillDown'

describe('AlertDrillDown', () => {
  it('exports AlertDrillDown component', () => {
    expect(mod.AlertDrillDown).toBeDefined()
    expect(typeof mod.AlertDrillDown).toBe('function')
  })
})
