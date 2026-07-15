/**
 * Smoke test for DataComplianceVaultSecrets card component.
 *
 * Verifies that the module loads without runtime errors and exports
 * the expected React component. This catches import/type breakage and
 * eliminates false-positive noise in the detect-untested-files CI check.
 *
 * Filed for kubestellar/console#21099 (part of #21094).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from './DataComplianceVaultSecrets'

describe('DataComplianceVaultSecrets module', () => {
  it('exports VaultSecrets as a function component', () => {
    expect(Mod.VaultSecrets).toBeDefined()
    expect(typeof Mod.VaultSecrets).toBe('function')
  })
})
