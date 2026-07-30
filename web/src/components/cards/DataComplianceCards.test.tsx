/**
 * Smoke test for DataComplianceCards re-export barrel.
 *
 * Verifies that the module loads without runtime errors and re-exports
 * the expected component symbols (VaultSecrets, ExternalSecrets, CertManager).
 * This catches import/type breakage and eliminates false-positive noise in the
 * detect-untested-files CI check.
 *
 * Filed for kubestellar/console#21099 (part of #21094).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from './DataComplianceCards'

describe('DataComplianceCards module', () => {
  it('re-exports VaultSecrets, ExternalSecrets, and CertManager', () => {
    expect(typeof Mod.VaultSecrets).toBe('function')
    expect(typeof Mod.ExternalSecrets).toBe('function')
    expect(typeof Mod.CertManager).toBe('function')
  })
})
