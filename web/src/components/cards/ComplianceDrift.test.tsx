/**
 * Smoke test for ComplianceDrift card component.
 *
 * Verifies that the module loads without runtime errors and exports
 * the expected React component. This catches import/type breakage and
 * eliminates false-positive noise in the detect-untested-files CI check.
 *
 * Filed for kubestellar/console#21099 (part of #21094).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from './ComplianceDrift'

describe('ComplianceDrift module', () => {
  it('exports ComplianceDrift as a function component', () => {
    expect(Mod.ComplianceDrift).toBeDefined()
    expect(typeof Mod.ComplianceDrift).toBe('function')
  })
})
