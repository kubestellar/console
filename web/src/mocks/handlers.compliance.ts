import { createV1SiemHandlers } from './compliance/handlers.v1-siem'
import { createV1IncidentsHandlers } from './compliance/handlers.v1-incidents'
import { createV1ThreatIntelHandlers } from './compliance/handlers.v1-threat-intel'
import { createV1SbomHandlers } from './compliance/handlers.v1-sbom'
import { createV1SigstoreHandlers } from './compliance/handlers.v1-sigstore'
import { createV1SlsaHandlers } from './compliance/handlers.v1-slsa'
import { createComplianceFrameworksHandlers } from './compliance/handlers.compliance-frameworks'
import { createComplianceHipaaHandlers } from './compliance/handlers.compliance-hipaa'
import { createComplianceGxpHandlers } from './compliance/handlers.compliance-gxp'
import { createComplianceBaaHandlers } from './compliance/handlers.compliance-baa'
import { createComplianceSodHandlers } from './compliance/handlers.compliance-sod'
import { createComplianceChangeControlHandlers } from './compliance/handlers.compliance-change-control'
import { createComplianceResidencyHandlers } from './compliance/handlers.compliance-residency'
import { createComplianceNistHandlers } from './compliance/handlers.compliance-nist'
import { createComplianceStigHandlers } from './compliance/handlers.compliance-stig'
import { createComplianceAirgapHandlers } from './compliance/handlers.compliance-airgap'
import { createComplianceFedrampHandlers } from './compliance/handlers.compliance-fedramp'
import { createIdentityOidcHandlers } from './compliance/handlers.identity-oidc'
import { createIdentityRbacHandlers } from './compliance/handlers.identity-rbac'
import { createIdentitySessionsHandlers } from './compliance/handlers.identity-sessions'
import { createCardsHandlers } from './compliance/handlers.cards'
import { createErmRiskMatrixHandlers } from './compliance/handlers.erm-risk-matrix'
import { createErmRiskRegisterHandlers } from './compliance/handlers.erm-risk-register'
import { createErmRiskAppetiteHandlers } from './compliance/handlers.erm-risk-appetite'

export function createComplianceHandlers() {
  return [
    ...createV1SiemHandlers(),
    ...createV1IncidentsHandlers(),
    ...createV1ThreatIntelHandlers(),
    ...createV1SbomHandlers(),
    ...createV1SigstoreHandlers(),
    ...createV1SlsaHandlers(),
    ...createComplianceFrameworksHandlers(),
    ...createComplianceHipaaHandlers(),
    ...createComplianceGxpHandlers(),
    ...createComplianceBaaHandlers(),
    ...createComplianceSodHandlers(),
    ...createComplianceChangeControlHandlers(),
    ...createComplianceResidencyHandlers(),
    ...createComplianceNistHandlers(),
    ...createComplianceStigHandlers(),
    ...createComplianceAirgapHandlers(),
    ...createComplianceFedrampHandlers(),
    ...createIdentityOidcHandlers(),
    ...createIdentityRbacHandlers(),
    ...createIdentitySessionsHandlers(),
    ...createCardsHandlers(),
    ...createErmRiskMatrixHandlers(),
    ...createErmRiskRegisterHandlers(),
    ...createErmRiskAppetiteHandlers(),
  ]
}
