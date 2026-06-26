/**
 * Security & Compliance Card Config Tests
 */
import { describe, it, expect } from 'vitest'
import { securityIssuesConfig } from '../security-issues'
import { complianceScoreConfig } from '../compliance-score'
import { complianceDriftConfig } from '../compliance-drift'
import { policyViolationsConfig } from '../policy-violations'
import { kubescapeScanConfig } from '../kubescape-scan'
import { kyvernoPoliciesConfig } from '../kyverno-policies'
import { opaPoliciesConfig } from '../opa-policies'
import { trivyScanConfig } from '../trivy-scan'
import { trestleScanConfig } from '../trestle-scan'
import { vaultSecretsConfig } from '../vault-secrets'
import { externalSecretsConfig } from '../external-secrets'
import { secretStatusConfig } from '../secret-status'
import { roleStatusConfig } from '../role-status'
import { roleBindingStatusConfig } from '../role-binding-status'
import { serviceAccountStatusConfig } from '../service-account-status'
import { crossClusterPolicyComparisonConfig } from '../cross-cluster-policy-comparison'
import { recommendedPoliciesConfig } from '../recommended-policies'
import { fleetComplianceHeatmapConfig } from '../fleet-compliance-heatmap'

const securityCards = [
  { name: 'securityIssues', config: securityIssuesConfig },
  { name: 'complianceScore', config: complianceScoreConfig },
  { name: 'complianceDrift', config: complianceDriftConfig },
  { name: 'policyViolations', config: policyViolationsConfig },
  { name: 'kubescapeScan', config: kubescapeScanConfig },
  { name: 'kyvernoPolicies', config: kyvernoPoliciesConfig },
  { name: 'opaPolicies', config: opaPoliciesConfig },
  { name: 'trivyScan', config: trivyScanConfig },
  { name: 'trestleScan', config: trestleScanConfig },
  { name: 'vaultSecrets', config: vaultSecretsConfig },
  { name: 'externalSecrets', config: externalSecretsConfig },
  { name: 'secretStatus', config: secretStatusConfig },
  { name: 'roleStatus', config: roleStatusConfig },
  { name: 'roleBindingStatus', config: roleBindingStatusConfig },
  { name: 'serviceAccountStatus', config: serviceAccountStatusConfig },
  { name: 'crossClusterPolicyComparison', config: crossClusterPolicyComparisonConfig },
  { name: 'recommendedPolicies', config: recommendedPoliciesConfig },
  { name: 'fleetComplianceHeatmap', config: fleetComplianceHeatmapConfig },
]

describe('Security & compliance card configs', () => {
  it.each(securityCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })
})
