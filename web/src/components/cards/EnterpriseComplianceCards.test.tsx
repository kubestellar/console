/**
 * Smoke test for EnterpriseComplianceCards module.
 *
 * Verifies that the module loads without runtime errors and exports all
 * enterprise compliance card components. This catches import/type breakage
 * and eliminates false-positive noise in the detect-untested-files CI check.
 *
 * Filed for kubestellar/console#21099 (part of #21094).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from './EnterpriseComplianceCards'

const EXPECTED_EXPORTS = [
  'ScoreRing',
  'HIPAACard',
  'GxPCard',
  'BAACard',
  'ComplianceFrameworksCard',
  'DataResidencyCard',
  'ChangeControlCard',
  'SegregationOfDutiesCard',
  'ComplianceReportsCard',
  'NISTCard',
  'STIGCard',
  'AirGapCard',
  'SIEMIntegrationCard',
  'IncidentResponseCard',
  'ThreatIntelCard',
  'FedRAMPCard',
  'OIDCFederationCard',
  'RBACAuditCard',
  'SessionManagementCard',
  'SBOMManagerCard',
  'SigstoreVerifyCard',
  'SLSAProvenanceCard',
  'RiskMatrixCard',
  'RiskRegisterCard',
  'RiskAppetiteCard',
] as const

describe('EnterpriseComplianceCards module', () => {
  it.each(EXPECTED_EXPORTS)('exports %s as a function component', (name) => {
    const value = (Mod as Record<string, unknown>)[name]
    expect(value).toBeDefined()
    expect(typeof value).toBe('function')
  })
})
