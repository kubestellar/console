/**
 * Smoke test for ISO27001Audit card component.
 *
 * Verifies that the module loads without runtime errors and exports
 * the expected React component. This catches import/type breakage and
 * eliminates false-positive noise in the detect-untested-files CI check.
 *
 * Filed for kubestellar/console#21099 (part of #21094).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from './ISO27001Audit'

describe('ISO27001Audit module', () => {
  it('exports ISO27001Audit as a function component', () => {
    expect(Mod.ISO27001Audit).toBeDefined()
    expect(typeof Mod.ISO27001Audit).toBe('function')
  })
})
