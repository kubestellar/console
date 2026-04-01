/**
 * AlertDrillDown Component Tests
 */
import { describe, it, expect } from 'vitest'
import * as mod from '../AlertDrillDown'

describe('AlertDrillDown', () => {
  it('exports AlertDrillDown component', () => {
    expect(mod.AlertDrillDown).toBeDefined()
    expect(typeof mod.AlertDrillDown).toBe('function')
  })
})
