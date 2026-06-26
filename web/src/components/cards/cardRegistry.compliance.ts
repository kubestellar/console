import type { CardComponent } from './cardRegistry.types'
import { createElement } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { getCardConfig } from '../../config/cards'
const _enterpriseComplianceBundle = import('./EnterpriseComplianceCards').catch(() => undefined as never)
const AirGapCard = safeLazy(() => _enterpriseComplianceBundle, 'AirGapCard')
const AirGapDashboardCard = safeLazy(() => import('../compliance/AirGapDashboard'), 'AirGapDashboardContent')
const AlertRulesCard = safeLazy(() => import('./AlertRules'), 'AlertRulesCard')
const BAACard = safeLazy(() => _enterpriseComplianceBundle, 'BAACard')
const BAADashboardCard = safeLazy(() => import('../compliance/BAADashboard'), 'BAADashboardContent')
const CertManager = safeLazy(() => import('./DataComplianceCards'), 'CertManager')
const ChangeControlCard = safeLazy(() => _enterpriseComplianceBundle, 'ChangeControlCard')
const ChangeControlDashboardCard = safeLazy(() => import('../compliance/ChangeControlAudit'), 'ChangeControlAuditContent')
const CloudCustodianStatus = safeLazy(() => import('./cloud_custodian_status'), 'CloudCustodianStatus')
const ComplianceDrift = safeLazy(() => import('./ComplianceDrift'), 'ComplianceDrift')
const ComplianceFrameworksCard = safeLazy(() => _enterpriseComplianceBundle, 'ComplianceFrameworksCard')
const ComplianceFrameworksDashboardCard = safeLazy(() => import('../compliance/ComplianceFrameworks'), 'ComplianceFrameworksContent')
const ComplianceReportsCard = safeLazy(() => _enterpriseComplianceBundle, 'ComplianceReportsCard')
const ComplianceReportsDashboardCard = safeLazy(() => import('../compliance/ComplianceReports'), 'ComplianceReportsContent')
const _complianceBundle = import('./ComplianceCards').catch(() => undefined as never)
const ComplianceScore = safeLazy(() => _complianceBundle, 'ComplianceScore')
const CrossClusterPolicyComparison = safeLazy(() => import('./CrossClusterPolicyComparison'), 'CrossClusterPolicyComparison')
const DNSTraceCard = safeLazy(() => import('./gadget/DNSTraceCard'), 'DNSTraceCard')
const DataResidencyCard = safeLazy(() => _enterpriseComplianceBundle, 'DataResidencyCard')
const DataResidencyDashboardCard = safeLazy(() => import('../compliance/DataResidency'), 'DataResidencyContent')
const DeploymentRiskScore = safeLazy(() => import('./DeploymentRiskScore'), 'DeploymentRiskScore')
const ExternalSecrets = safeLazy(() => import('./DataComplianceCards'), 'ExternalSecrets')
const FalcoAlerts = safeLazy(() => _complianceBundle, 'FalcoAlerts')
const FedRAMPCard = safeLazy(() => _enterpriseComplianceBundle, 'FedRAMPCard')
const FedRAMPDashboardCard = safeLazy(() => import('../compliance/FedRAMPDashboard'), 'FedRAMPDashboardContent')
const FleetComplianceHeatmap = safeLazy(() => import('./FleetComplianceHeatmap'), 'FleetComplianceHeatmap')
const GxPCard = safeLazy(() => _enterpriseComplianceBundle, 'GxPCard')
const GxPDashboardCard = safeLazy(() => import('../compliance/GxPDashboard'), 'GxPDashboardContent')
const HIPAACard = safeLazy(() => _enterpriseComplianceBundle, 'HIPAACard')
const HIPAADashboardCard = safeLazy(() => import('../compliance/HIPAADashboard'), 'HIPAADashboardContent')
const ISO27001Audit = safeLazy(() => import('./ISO27001Audit'), 'ISO27001Audit')
const IncidentResponseCard = safeLazy(() => _enterpriseComplianceBundle, 'IncidentResponseCard')
const IntotoSupplyChain = safeLazy(() => import('./intoto_supply_chain'), 'IntotoSupplyChain')
const KeycloakStatus = safeLazy(() => import('./keycloak_status'), 'KeycloakStatus')
const KubescapeScan = safeLazy(() => _complianceBundle, 'KubescapeScan')
const KyvernoPolicies = safeLazy(() => import('./KyvernoPolicies'), 'KyvernoPolicies')
const NISTCard = safeLazy(() => _enterpriseComplianceBundle, 'NISTCard')
const NISTDashboardCard = safeLazy(() => import('../compliance/NISTDashboard'), 'NISTDashboardContent')
const NamespaceRBAC = safeLazy(() => import('./NamespaceRBAC'), 'NamespaceRBAC')
const _clusterAdminBundle = import('./cluster-admin-bundle').catch(() => undefined as never)
const NetworkPolicyCoverage = safeLazy(() => _clusterAdminBundle, 'NetworkPolicyCoverage')
const NetworkTraceCard = safeLazy(() => import('./gadget/NetworkTraceCard'), 'NetworkTraceCard')
const OIDCDashboardCard = safeLazy(() => import('../compliance/OIDCDashboard'), 'OIDCDashboardContent')
const OIDCFederationCard = safeLazy(() => _enterpriseComplianceBundle, 'OIDCFederationCard')
const OPAPolicies = safeLazy(() => import('./OPAPolicies'), 'OPAPolicies')
const OpenfgaStatus = safeLazy(() => import('./openfga_status'), 'OpenfgaStatus')
const PolicyViolations = safeLazy(() => _complianceBundle, 'PolicyViolations')
const ProcessTraceCard = safeLazy(() => import('./gadget/ProcessTraceCard'), 'ProcessTraceCard')
const RBACAuditCard = safeLazy(() => _enterpriseComplianceBundle, 'RBACAuditCard')
const RBACAuditDashboardCard = safeLazy(() => import('../compliance/RBACAuditDashboard'), 'RBACAuditDashboardContent')
const RecommendedPolicies = safeLazy(() => import('./RecommendedPolicies'), 'RecommendedPolicies')
const RiskAppetiteCard = safeLazy(() => _enterpriseComplianceBundle, 'RiskAppetiteCard')
const RiskMatrixCard = safeLazy(() => _enterpriseComplianceBundle, 'RiskMatrixCard')
const RiskRegisterCard = safeLazy(() => _enterpriseComplianceBundle, 'RiskRegisterCard')
const RuntimeAttestationCard = safeLazy(() => import('./RuntimeAttestationCard'), 'RuntimeAttestationCard')
const SBOMManagerCard = safeLazy(() => _enterpriseComplianceBundle, 'SBOMManagerCard')
const SIEMIntegrationCard = safeLazy(() => _enterpriseComplianceBundle, 'SIEMIntegrationCard')
const SLSAProvenanceCard = safeLazy(() => _enterpriseComplianceBundle, 'SLSAProvenanceCard')
const STIGCard = safeLazy(() => _enterpriseComplianceBundle, 'STIGCard')
const STIGDashboardCard = safeLazy(() => import('../compliance/STIGDashboard'), 'STIGDashboardContent')
const SecurityAuditCard = safeLazy(() => import('./gadget/SecurityAuditCard'), 'SecurityAuditCard')
const SecurityIssues = safeLazy(() => import('./SecurityIssues'), 'SecurityIssues')
const SegregationOfDutiesCard = safeLazy(() => _enterpriseComplianceBundle, 'SegregationOfDutiesCard')
const SegregationOfDutiesDashboardCard = safeLazy(() => import('../compliance/SegregationOfDuties'), 'SegregationOfDutiesContent')
const SessionDashboardCard = safeLazy(() => import('../compliance/SessionDashboard'), 'SessionDashboardContent')
const SessionManagementCard = safeLazy(() => _enterpriseComplianceBundle, 'SessionManagementCard')
const SigstoreVerifyCard = safeLazy(() => _enterpriseComplianceBundle, 'SigstoreVerifyCard')
const ThreatIntelCard = safeLazy(() => _enterpriseComplianceBundle, 'ThreatIntelCard')
const TrestleScan = safeLazy(() => import('./TrestleScan'), 'TrestleScan')
const TrivyScan = safeLazy(() => _complianceBundle, 'TrivyScan')
const TufStatus = safeLazy(() => import('./tuf_status'), 'TufStatus')
const VaultSecrets = safeLazy(() => import('./DataComplianceCards'), 'VaultSecrets')

/**
 * Compliance and security cards.
 * Cards:
 * air_gap_readiness, airgap_dashboard, alert_rules, baa_dashboard, baa_tracker, cert_manager,
 * change_control, change_control_dashboard, cloud_custodian_status, compliance_drift,
 * compliance_frameworks, compliance_frameworks_dashboard, compliance_reports,
 * compliance_reports_dashboard, compliance_score, cross_cluster_policy_comparison, data_residency,
 * data_residency_dashboard, deployment_risk_score, dns_trace, external_secrets, falco_alerts,
 * fedramp_dashboard, fedramp_readiness, fleet_compliance_heatmap, gxp_dashboard, gxp_validation,
 * hipaa_compliance, hipaa_dashboard, incident_response, intoto_supply_chain, iso27001_audit,
 * keycloak_status, kubescape_scan, kyverno_policies, namespace_rbac, network_policies,
 * network_policy_status, network_trace, nist_800_53, nist_dashboard, oidc_dashboard,
 * oidc_federation, opa_policies, openfga_status, policy_violations, process_trace, rbac_audit,
 * rbac_audit_dashboard, rbac_summary, recommended_policies, risk_appetite,
 * risk_appetite_dashboard, risk_matrix, risk_matrix_dashboard, risk_register,
 * risk_register_dashboard, role_binding_status, role_status, runtime_attestation, sbom_dashboard,
 * sbom_manager, secret_status, security_audit, security_issues, security_overview,
 * segregation_of_duties, segregation_of_duties_dashboard, service_account_status,
 * session_dashboard, session_management, siem_integration, sigstore_dashboard, sigstore_verify,
 * slsa_dashboard, slsa_provenance, stig_compliance, stig_dashboard, threat_intel, trestle_scan,
 * trivy_scan, tuf_status, vault_secrets
 */
export interface CardRegistryDomain {
  components: Record<string, CardComponent>
  demoDataCards: Set<string>
  liveDataCards: Set<string>
  chunkPreloaders: Record<string, () => Promise<unknown>>
  defaultWidths: Record<string, number>
}

const LazyUnifiedCard = safeLazy(() => import('../../lib/unified/card/UnifiedCard'), 'UnifiedCard')
const UNIFIED_CONTENT_TYPES = ['list', 'table', 'chart', 'status-grid']

function makeUnifiedEntry(cardType: string): CardComponent | undefined {
  const config = getCardConfig(cardType)
  if (!config?.dataSource || !config?.content || !UNIFIED_CONTENT_TYPES.includes(config.content.type)) {
    return undefined
  }
  const Adapter: CardComponent = () => createElement(LazyUnifiedCard, { config, className: 'h-full' })
  Adapter.displayName = `Unified(${cardType})`
  return Adapter
}

const components: Record<string, CardComponent> = {
  air_gap_readiness: AirGapCard,
  airgap_dashboard: AirGapDashboardCard,
  alert_rules: AlertRulesCard,
  baa_dashboard: BAADashboardCard,
  baa_tracker: BAACard,
  cert_manager: CertManager,
  change_control: ChangeControlCard,
  change_control_dashboard: ChangeControlDashboardCard,
  cloud_custodian_status: CloudCustodianStatus,
  compliance_drift: ComplianceDrift,
  compliance_frameworks: ComplianceFrameworksCard,
  compliance_frameworks_dashboard: ComplianceFrameworksDashboardCard,
  compliance_reports: ComplianceReportsCard,
  compliance_reports_dashboard: ComplianceReportsDashboardCard,
  compliance_score: ComplianceScore,
  cross_cluster_policy_comparison: CrossClusterPolicyComparison,
  data_residency: DataResidencyCard,
  data_residency_dashboard: DataResidencyDashboardCard,
  deployment_risk_score: DeploymentRiskScore,
  dns_trace: DNSTraceCard,
  external_secrets: ExternalSecrets,
  falco_alerts: FalcoAlerts,
  fedramp_dashboard: FedRAMPDashboardCard,
  fedramp_readiness: FedRAMPCard,
  fleet_compliance_heatmap: FleetComplianceHeatmap,
  gxp_dashboard: GxPDashboardCard,
  gxp_validation: GxPCard,
  hipaa_compliance: HIPAACard,
  hipaa_dashboard: HIPAADashboardCard,
  incident_response: IncidentResponseCard,
  intoto_supply_chain: IntotoSupplyChain,
  iso27001_audit: ISO27001Audit,
  keycloak_status: KeycloakStatus,
  kubescape_scan: KubescapeScan,
  kyverno_policies: KyvernoPolicies,
  namespace_rbac: NamespaceRBAC,
  network_policies: NetworkPolicyCoverage,
  network_trace: NetworkTraceCard,
  nist_800_53: NISTCard,
  nist_dashboard: NISTDashboardCard,
  oidc_dashboard: OIDCDashboardCard,
  oidc_federation: OIDCFederationCard,
  opa_policies: OPAPolicies,
  openfga_status: OpenfgaStatus,
  policy_violations: PolicyViolations,
  process_trace: ProcessTraceCard,
  rbac_audit: RBACAuditCard,
  rbac_audit_dashboard: RBACAuditDashboardCard,
  rbac_summary: NamespaceRBAC,
  recommended_policies: RecommendedPolicies,
  risk_appetite: RiskAppetiteCard,
  risk_appetite_dashboard: safeLazy(() => import('../compliance/RiskAppetiteDashboard'), 'RiskAppetiteDashboardContent'),
  risk_matrix: RiskMatrixCard,
  risk_matrix_dashboard: safeLazy(() => import('../compliance/RiskMatrixDashboard'), 'RiskMatrixDashboardContent'),
  risk_register: RiskRegisterCard,
  risk_register_dashboard: safeLazy(() => import('../compliance/RiskRegisterDashboard'), 'RiskRegisterDashboardContent'),
  runtime_attestation: RuntimeAttestationCard,
  sbom_dashboard: safeLazy(() => import('../compliance/SBOMDashboard'), 'SBOMDashboardContent'),
  sbom_manager: SBOMManagerCard,
  security_audit: SecurityAuditCard,
  security_issues: SecurityIssues,
  security_overview: SecurityIssues,
  segregation_of_duties: SegregationOfDutiesCard,
  segregation_of_duties_dashboard: SegregationOfDutiesDashboardCard,
  session_dashboard: SessionDashboardCard,
  session_management: SessionManagementCard,
  siem_integration: SIEMIntegrationCard,
  sigstore_dashboard: safeLazy(() => import('../compliance/SigstoreDashboard'), 'SigstoreDashboardContent'),
  sigstore_verify: SigstoreVerifyCard,
  slsa_dashboard: safeLazy(() => import('../compliance/SLSADashboard'), 'SLSADashboardContent'),
  slsa_provenance: SLSAProvenanceCard,
  stig_compliance: STIGCard,
  stig_dashboard: STIGDashboardCard,
  threat_intel: ThreatIntelCard,
  trestle_scan: TrestleScan,
  trivy_scan: TrivyScan,
  tuf_status: TufStatus,
  vault_secrets: VaultSecrets,
}

const network_policy_statusComponent = makeUnifiedEntry('network_policy_status')
if (network_policy_statusComponent) components['network_policy_status'] = network_policy_statusComponent
const role_binding_statusComponent = makeUnifiedEntry('role_binding_status')
if (role_binding_statusComponent) components['role_binding_status'] = role_binding_statusComponent
const role_statusComponent = makeUnifiedEntry('role_status')
if (role_statusComponent) components['role_status'] = role_statusComponent
const secret_statusComponent = makeUnifiedEntry('secret_status')
if (secret_statusComponent) components['secret_status'] = secret_statusComponent
const service_account_statusComponent = makeUnifiedEntry('service_account_status')
if (service_account_statusComponent) components['service_account_status'] = service_account_statusComponent

export const complianceCardRegistry: CardRegistryDomain = {
  components,
  demoDataCards: new Set([
    'deployment_risk_score',
    'external_secrets',
    'falco_alerts',
    'vault_secrets',
  ]),
  liveDataCards: new Set([
    'cert_manager',
    'intoto_supply_chain',
    'keycloak_status',
    'network_policies',
  ]),
  chunkPreloaders: {
    alert_rules: () => import('./AlertRules'),
    cert_manager: () => import('./DataComplianceCards'),
    cloud_custodian_status: () => import('./cloud_custodian_status'),
    compliance_drift: () => import('./ComplianceDrift'),
    compliance_score: () => import('./ComplianceCards'),
    cross_cluster_policy_comparison: () => import('./CrossClusterPolicyComparison'),
    deployment_risk_score: () => import('./DeploymentRiskScore'),
    dns_trace: () => import('./gadget/DNSTraceCard'),
    external_secrets: () => import('./DataComplianceCards'),
    falco_alerts: () => import('./ComplianceCards'),
    fleet_compliance_heatmap: () => import('./FleetComplianceHeatmap'),
    intoto_supply_chain: () => import('./intoto_supply_chain'),
    iso27001_audit: () => import('./ISO27001Audit'),
    keycloak_status: () => import('./keycloak_status'),
    kubescape_scan: () => import('./ComplianceCards'),
    kyverno_policies: () => import('./KyvernoPolicies'),
    namespace_rbac: () => import('./NamespaceRBAC'),
    network_policies: () => import('./cluster-admin-bundle'),
    network_trace: () => import('./gadget/NetworkTraceCard'),
    opa_policies: () => import('./OPAPolicies'),
    openfga_status: () => import('./openfga_status'),
    policy_violations: () => import('./ComplianceCards'),
    process_trace: () => import('./gadget/ProcessTraceCard'),
    recommended_policies: () => import('./RecommendedPolicies'),
    security_audit: () => import('./gadget/SecurityAuditCard'),
    security_issues: () => import('./SecurityIssues'),
    trestle_scan: () => import('./TrestleScan'),
    trivy_scan: () => import('./ComplianceCards'),
    tuf_status: () => import('./tuf_status'),
    vault_secrets: () => import('./DataComplianceCards'),
  },
  defaultWidths: {
    airgap_dashboard: 12,
    alert_rules: 6,
    baa_dashboard: 12,
    cert_manager: 4,
    change_control_dashboard: 12,
    cloud_custodian_status: 6,
    compliance_drift: 5,
    compliance_frameworks_dashboard: 12,
    compliance_reports_dashboard: 12,
    compliance_score: 4,
    cross_cluster_policy_comparison: 5,
    data_residency_dashboard: 12,
    deployment_risk_score: 6,
    external_secrets: 4,
    falco_alerts: 4,
    fedramp_dashboard: 12,
    fleet_compliance_heatmap: 6,
    gxp_dashboard: 12,
    hipaa_dashboard: 12,
    intoto_supply_chain: 6,
    iso27001_audit: 6,
    keycloak_status: 6,
    kubescape_scan: 4,
    kyverno_policies: 6,
    namespace_rbac: 6,
    network_policies: 6,
    nist_dashboard: 12,
    oidc_dashboard: 12,
    opa_policies: 6,
    openfga_status: 6,
    policy_violations: 6,
    rbac_audit_dashboard: 12,
    recommended_policies: 6,
    risk_appetite_dashboard: 12,
    risk_matrix_dashboard: 12,
    risk_register_dashboard: 12,
    runtime_attestation: 6,
    sbom_dashboard: 12,
    security_issues: 4,
    segregation_of_duties_dashboard: 12,
    session_dashboard: 12,
    sigstore_dashboard: 12,
    slsa_dashboard: 12,
    stig_dashboard: 12,
    trestle_scan: 6,
    trivy_scan: 4,
    tuf_status: 6,
    vault_secrets: 4,
  },
}
