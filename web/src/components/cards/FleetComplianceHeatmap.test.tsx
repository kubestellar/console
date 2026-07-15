/**
 * Smoke test for FleetComplianceHeatmap card component.
 *
 * Verifies that the module loads without runtime errors and exports
 * the expected React component. This catches import/type breakage and
 * eliminates false-positive noise in the detect-untested-files CI check.
 *
 * Filed for kubestellar/console#21099 (part of #21094).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from './FleetComplianceHeatmap'

describe('FleetComplianceHeatmap module', () => {
  it('exports FleetComplianceHeatmap as a function component', () => {
    expect(Mod.FleetComplianceHeatmap).toBeDefined()
    expect(typeof Mod.FleetComplianceHeatmap).toBe('function')
  })
})
