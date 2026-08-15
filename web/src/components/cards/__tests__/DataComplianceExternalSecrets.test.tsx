/**
 * Smoke test for DataComplianceExternalSecrets card component.
 *
 * Verifies that the module loads without runtime errors and exports
 * the expected React component. Comprehensive behavioral coverage already
 * exists in ../DataComplianceExternalSecrets.test.tsx; this file exists so
 * the detect-untested-files CI check recognizes the card as covered (it
 * only counts src/components/cards/__tests__/<Name>.test.tsx).
 *
 * Filed for kubestellar/console#22529 (part of #22484 / split from #22504).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from '../DataComplianceExternalSecrets'

describe('DataComplianceExternalSecrets module', () => {
  it('exports ExternalSecrets as a function component', () => {
    expect(Mod.ExternalSecrets).toBeDefined()
    expect(typeof Mod.ExternalSecrets).toBe('function')
  })
})
