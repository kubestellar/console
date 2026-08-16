/**
 * Smoke test for the DataComplianceVaultSecrets card component.
 *
 * Verifies that the module loads without runtime errors and exports the
 * expected React component. Comprehensive behavioral coverage already
 * exists in ../DataComplianceVaultSecrets.test.tsx; this file exists so the
 * detect-untested-files CI check recognizes DataComplianceVaultSecrets.tsx as
 * covered (it only counts src/components/cards/__tests__/<Name>.test.tsx
 * matching the source file's basename).
 *
 * Filed for kubestellar/console#22529 (part of #22484).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from '../DataComplianceVaultSecrets'

describe('DataComplianceVaultSecrets module', () => {
  it('exports VaultSecrets as a function component', () => {
    expect(Mod.VaultSecrets).toBeDefined()
    expect(typeof Mod.VaultSecrets).toBe('function')
  })
})
