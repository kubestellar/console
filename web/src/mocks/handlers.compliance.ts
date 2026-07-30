// Barrel — re-exports createComplianceHandlers() assembled from focused sub-modules.
// See the individual files for domain-specific handler implementations:
//   handlers.compliance.frameworks.ts  — Frameworks, HIPAA, GxP, BAA, SOD, Change Control, Data Residency
//   handlers.compliance.gov.ts         — NIST 800-53, DISA STIG, Air-Gap, FedRAMP, Identity & Access
//   handlers.compliance.security.ts    — SIEM, Incident Response, Threat Intel, Supply Chain (Epic 6)
//   handlers.compliance.erm.ts         — Enterprise Risk Management (Epic 7) + card templates

import { createComplianceFrameworkHandlers } from './handlers.compliance.frameworks'
import { createComplianceGovHandlers } from './handlers.compliance.gov'
import { createComplianceSecurityHandlers } from './handlers.compliance.security'
import { createComplianceErmHandlers } from './handlers.compliance.erm'

export function createComplianceHandlers() {
  return [
    ...createComplianceFrameworkHandlers(),
    ...createComplianceGovHandlers(),
    ...createComplianceSecurityHandlers(),
    ...createComplianceErmHandlers(),
  ]
}
