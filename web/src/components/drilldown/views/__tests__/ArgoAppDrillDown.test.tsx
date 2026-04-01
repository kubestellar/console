/**
 * ArgoAppDrillDown Component Tests
 */
import { describe, it, expect } from 'vitest'
import * as mod from '../ArgoAppDrillDown'

describe('ArgoAppDrillDown', () => {
  it('exports ArgoAppDrillDown component', () => {
    expect(mod.ArgoAppDrillDown).toBeDefined()
    expect(typeof mod.ArgoAppDrillDown).toBe('function')
  })
})
