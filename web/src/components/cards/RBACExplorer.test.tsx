/**
 * Smoke test for RBACExplorer card component.
 *
 * Verifies that the module loads without runtime errors and exports
 * the expected React component. This catches import/type breakage and
 * eliminates false-positive noise in the detect-untested-files CI check.
 *
 * Filed for kubestellar/console#21099 (part of #21094).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from './RBACExplorer'

describe('RBACExplorer module', () => {
  it('exports RBACExplorer as a function component', () => {
    expect(Mod.RBACExplorer).toBeDefined()
    expect(typeof Mod.RBACExplorer).toBe('function')
  })
})
