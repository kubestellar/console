/**
 * Smoke test for DataComplianceVaultSecrets card component.
 *
 * Verifies that the module loads without runtime errors and exports
 * the expected React component. Comprehensive behavioral coverage already
 * exists in ../DataComplianceVaultSecrets.test.tsx; this file exists so the
 * detect-untested-files CI check recognizes the card as covered (it only
 * counts src/components/cards/__tests__/<Name>.test.tsx).
 *
 * Filed for kubestellar/console#22529 (part of #22484 / split from #22504).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from '../DataComplianceVaultSecrets'

describe('DataComplianceVaultSecrets module', () => {
  it('exports VaultSecrets as a function component', () => {
    expect(Mod.VaultSecrets).toBeDefined()
    expect(typeof Mod.VaultSecrets).toBe('function')
  })
})
