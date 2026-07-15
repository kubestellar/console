/**
 * Smoke test for OPAPolicies card component.
 *
 * Verifies that the module loads without runtime errors and exports
 * the expected React component. This catches import/type breakage and
 * eliminates false-positive noise in the detect-untested-files CI check.
 *
 * Filed for kubestellar/console#21099 (part of #21094).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from './OPAPolicies'

describe('OPAPolicies module', () => {
  it('exports OPAPolicies as a function component', () => {
    expect(Mod.OPAPolicies).toBeDefined()
    expect(typeof Mod.OPAPolicies).toBe('function')
  })
})
