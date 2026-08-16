import { describe, it, expect } from 'vitest'
import * as Mod from '../ComplianceCards'

describe('ComplianceCards module', () => {
  it('re-exports the compliance card components', () => {
    expect(typeof Mod.ComplianceScore).toBe('function')
    expect(typeof Mod.FalcoAlerts).toBe('function')
    expect(typeof Mod.TrivyScan).toBe('function')
    expect(typeof Mod.KubescapeScan).toBe('function')
    expect(typeof Mod.PolicyViolations).toBe('function')
  })
})
