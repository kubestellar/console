import { safeLazy } from '../../lib/safeLazy'
import type { CardRegistryCategory } from './cardRegistry.types'

const SecurityIssues = safeLazy(() => import('./SecurityIssues'), 'SecurityIssues')
const AlertRulesCard = safeLazy(() => import('./AlertRules'), 'AlertRulesCard')
const OPAPolicies = safeLazy(() => import('./OPAPolicies'), 'OPAPolicies')
const FleetComplianceHeatmap = safeLazy(() => import('./FleetComplianceHeatmap'), 'FleetComplianceHeatmap')
const ComplianceDrift = safeLazy(() => import('./ComplianceDrift'), 'ComplianceDrift')
const CrossClusterPolicyComparison = safeLazy(() => import('./CrossClusterPolicyComparison'), 'CrossClusterPolicyComparison')
const RecommendedPolicies = safeLazy(() => import('./RecommendedPolicies'), 'RecommendedPolicies')
const KyvernoPolicies = safeLazy(() => import('./KyvernoPolicies'), 'KyvernoPolicies')
const IntotoSupplyChain = safeLazy(() => import('./intoto_supply_chain'), 'IntotoSupplyChain')
const _complianceBundle = import('./ComplianceCards').catch(() => undefined as never)
const FalcoAlerts = safeLazy(() => _complianceBundle, 'FalcoAlerts')
const TrivyScan = safeLazy(() => _complianceBundle, 'TrivyScan')
const KubescapeScan = safeLazy(() => _complianceBundle, 'KubescapeScan')
const PolicyViolations = safeLazy(() => _complianceBundle, 'PolicyViolations')
const ComplianceScore = safeLazy(() => _complianceBundle, 'ComplianceScore')
const TrestleScan = safeLazy(() => import('./TrestleScan'), 'TrestleScan')
const VaultSecrets = safeLazy(() => import('./DataComplianceCards'), 'VaultSecrets')
const ExternalSecrets = safeLazy(() => import('./DataComplianceCards'), 'ExternalSecrets')
const CertManager = safeLazy(() => import('./DataComplianceCards'), 'CertManager')
const _enterpriseComplianceBundle = import('./EnterpriseComplianceCards').catch(() => undefined as never)
const HIPAACard = safeLazy(() => _enterpriseComplianceBundle, 'HIPAACard')
const GxPCard = safeLazy(() => _enterpriseComplianceBundle, 'GxPCard')
const BAACard = safeLazy(() => _enterpriseComplianceBundle, 'BAACard')
const ComplianceFrameworksCard = safeLazy(() => _enterpriseComplianceBundle, 'ComplianceFrameworksCard')
const DataResidencyCard = safeLazy(() => _enterpriseComplianceBundle, 'DataResidencyCard')
const ChangeControlCard = safeLazy(() => _enterpriseComplianceBundle, 'ChangeControlCard')
const SegregationOfDutiesCard = safeLazy(() => _enterpriseComplianceBundle, 'SegregationOfDutiesCard')
const ComplianceReportsCard = safeLazy(() => _enterpriseComplianceBundle, 'ComplianceReportsCard')
const NISTCard = safeLazy(() => _enterpriseComplianceBundle, 'NISTCard')
const STIGCard = safeLazy(() => _enterpriseComplianceBundle, 'STIGCard')
const AirGapCard = safeLazy(() => _enterpriseComplianceBundle, 'AirGapCard')
const FedRAMPCard = safeLazy(() => _enterpriseComplianceBundle, 'FedRAMPCard')
const OIDCFederationCard = safeLazy(() => _enterpriseComplianceBundle, 'OIDCFederationCard')
const RBACAuditCard = safeLazy(() => _enterpriseComplianceBundle, 'RBACAuditCard')
const SessionManagementCard = safeLazy(() => _enterpriseComplianceBundle, 'SessionManagementCard')
const SIEMIntegrationCard = safeLazy(() => _enterpriseComplianceBundle, 'SIEMIntegrationCard')
const IncidentResponseCard = safeLazy(() => _enterpriseComplianceBundle, 'IncidentResponseCard')
const ThreatIntelCard = safeLazy(() => _enterpriseComplianceBundle, 'ThreatIntelCard')
const SBOMManagerCard = safeLazy(() => _enterpriseComplianceBundle, 'SBOMManagerCard')
const SigstoreVerifyCard = safeLazy(() => _enterpriseComplianceBundle, 'SigstoreVerifyCard')
const SLSAProvenanceCard = safeLazy(() => _enterpriseComplianceBundle, 'SLSAProvenanceCard')
const RiskMatrixCard = safeLazy(() => _enterpriseComplianceBundle, 'RiskMatrixCard')
const RiskRegisterCard = safeLazy(() => _enterpriseComplianceBundle, 'RiskRegisterCard')
const RiskAppetiteCard = safeLazy(() => _enterpriseComplianceBundle, 'RiskAppetiteCard')
const ComplianceFrameworksDashboardCard = safeLazy(() => import('../compliance/ComplianceFrameworks'), 'ComplianceFrameworksContent')
const ChangeControlDashboardCard = safeLazy(() => import('../compliance/ChangeControlAudit'), 'ChangeControlAuditContent')
const SegregationOfDutiesDashboardCard = safeLazy(() => import('../compliance/SegregationOfDuties'), 'SegregationOfDutiesContent')
const DataResidencyDashboardCard = safeLazy(() => import('../compliance/DataResidency'), 'DataResidencyContent')
const ComplianceReportsDashboardCard = safeLazy(() => import('../compliance/ComplianceReports'), 'ComplianceReportsContent')
const HIPAADashboardCard = safeLazy(() => import('../compliance/HIPAADashboard'), 'HIPAADashboardContent')
const GxPDashboardCard = safeLazy(() => import('../compliance/GxPDashboard'), 'GxPDashboardContent')
const BAADashboardCard = safeLazy(() => import('../compliance/BAADashboard'), 'BAADashboardContent')
const NISTDashboardCard = safeLazy(() => import('../compliance/NISTDashboard'), 'NISTDashboardContent')
const STIGDashboardCard = safeLazy(() => import('../compliance/STIGDashboard'), 'STIGDashboardContent')
const AirGapDashboardCard = safeLazy(() => import('../compliance/AirGapDashboard'), 'AirGapDashboardContent')
const FedRAMPDashboardCard = safeLazy(() => import('../compliance/FedRAMPDashboard'), 'FedRAMPDashboardContent')
const OIDCDashboardCard = safeLazy(() => import('../compliance/OIDCDashboard'), 'OIDCDashboardContent')
const RBACAuditDashboardCard = safeLazy(() => import('../compliance/RBACAuditDashboard'), 'RBACAuditDashboardContent')
const SessionDashboardCard = safeLazy(() => import('../compliance/SessionDashboard'), 'SessionDashboardContent')
const ISO27001Audit = safeLazy(() => import('./ISO27001Audit'), 'ISO27001Audit')
const RuntimeAttestationCard = safeLazy(() => import('./RuntimeAttestationCard'), 'RuntimeAttestationCard')
const DeploymentRiskScore = safeLazy(() => import('./DeploymentRiskScore'), 'DeploymentRiskScore')
const NetworkTraceCard = safeLazy(() => import('./gadget/NetworkTraceCard'), 'NetworkTraceCard')
const DNSTraceCard = safeLazy(() => import('./gadget/DNSTraceCard'), 'DNSTraceCard')
const ProcessTraceCard = safeLazy(() => import('./gadget/ProcessTraceCard'), 'ProcessTraceCard')
const SecurityAuditCard = safeLazy(() => import('./gadget/SecurityAuditCard'), 'SecurityAuditCard')

export const securityCardRegistry: CardRegistryCategory = {
  components: {
    security_issues: SecurityIssues, security_overview: SecurityIssues, alert_rules: AlertRulesCard, opa_policies: OPAPolicies, kyverno_policies: KyvernoPolicies,
    intoto_supply_chain: IntotoSupplyChain, falco_alerts: FalcoAlerts, trestle_scan: TrestleScan, trivy_scan: TrivyScan,
    kubescape_scan: KubescapeScan, policy_violations: PolicyViolations, compliance_score: ComplianceScore,
    hipaa_compliance: HIPAACard, gxp_validation: GxPCard, baa_tracker: BAACard, compliance_frameworks: ComplianceFrameworksCard,
    data_residency: DataResidencyCard, change_control: ChangeControlCard, segregation_of_duties: SegregationOfDutiesCard,
    compliance_reports: ComplianceReportsCard, nist_800_53: NISTCard, stig_compliance: STIGCard, air_gap_readiness: AirGapCard,
    fedramp_readiness: FedRAMPCard, oidc_federation: OIDCFederationCard, rbac_audit: RBACAuditCard,
    session_management: SessionManagementCard, siem_integration: SIEMIntegrationCard, incident_response: IncidentResponseCard,
    threat_intel: ThreatIntelCard, runtime_attestation: RuntimeAttestationCard, sbom_manager: SBOMManagerCard,
    sigstore_verify: SigstoreVerifyCard, slsa_provenance: SLSAProvenanceCard, risk_matrix: RiskMatrixCard,
    risk_register: RiskRegisterCard, risk_appetite: RiskAppetiteCard, sbom_dashboard: safeLazy(() => import('../compliance/SBOMDashboard'), 'SBOMDashboardContent'),
    sigstore_dashboard: safeLazy(() => import('../compliance/SigstoreDashboard'), 'SigstoreDashboardContent'),
    slsa_dashboard: safeLazy(() => import('../compliance/SLSADashboard'), 'SLSADashboardContent'),
    compliance_frameworks_dashboard: ComplianceFrameworksDashboardCard, change_control_dashboard: ChangeControlDashboardCard,
    segregation_of_duties_dashboard: SegregationOfDutiesDashboardCard, data_residency_dashboard: DataResidencyDashboardCard,
    compliance_reports_dashboard: ComplianceReportsDashboardCard, hipaa_dashboard: HIPAADashboardCard, gxp_dashboard: GxPDashboardCard,
    baa_dashboard: BAADashboardCard, nist_dashboard: NISTDashboardCard, stig_dashboard: STIGDashboardCard,
    airgap_dashboard: AirGapDashboardCard, fedramp_dashboard: FedRAMPDashboardCard, oidc_dashboard: OIDCDashboardCard,
    rbac_audit_dashboard: RBACAuditDashboardCard, session_dashboard: SessionDashboardCard,
    risk_matrix_dashboard: safeLazy(() => import('../compliance/RiskMatrixDashboard'), 'RiskMatrixDashboardContent'),
    risk_register_dashboard: safeLazy(() => import('../compliance/RiskRegisterDashboard'), 'RiskRegisterDashboardContent'),
    risk_appetite_dashboard: safeLazy(() => import('../compliance/RiskAppetiteDashboard'), 'RiskAppetiteDashboardContent'),
    iso27001_audit: ISO27001Audit, fleet_compliance_heatmap: FleetComplianceHeatmap, compliance_drift: ComplianceDrift,
    cross_cluster_policy_comparison: CrossClusterPolicyComparison, recommended_policies: RecommendedPolicies,
    vault_secrets: VaultSecrets, external_secrets: ExternalSecrets, cert_manager: CertManager,
    deployment_risk_score: DeploymentRiskScore, network_trace: NetworkTraceCard, dns_trace: DNSTraceCard,
    process_trace: ProcessTraceCard, security_audit: SecurityAuditCard,
  },
  preloaders: {
    security_issues: () => import('./SecurityIssues'), alert_rules: () => import('./AlertRules'), opa_policies: () => import('./OPAPolicies'),
    kyverno_policies: () => import('./KyvernoPolicies'), intoto_supply_chain: () => import('./intoto_supply_chain'),
    falco_alerts: () => import('./ComplianceCards'), trestle_scan: () => import('./TrestleScan'), trivy_scan: () => import('./ComplianceCards'),
    kubescape_scan: () => import('./ComplianceCards'), policy_violations: () => import('./ComplianceCards'), compliance_score: () => import('./ComplianceCards'),
    iso27001_audit: () => import('./ISO27001Audit'), fleet_compliance_heatmap: () => import('./FleetComplianceHeatmap'),
    compliance_drift: () => import('./ComplianceDrift'), cross_cluster_policy_comparison: () => import('./CrossClusterPolicyComparison'),
    recommended_policies: () => import('./RecommendedPolicies'), vault_secrets: () => import('./DataComplianceCards'),
    external_secrets: () => import('./DataComplianceCards'), cert_manager: () => import('./DataComplianceCards'),
    hipaa_compliance: () => import('./EnterpriseComplianceCards'), gxp_validation: () => import('./EnterpriseComplianceCards'),
    baa_tracker: () => import('./EnterpriseComplianceCards'), compliance_frameworks: () => import('./EnterpriseComplianceCards'),
    data_residency: () => import('./EnterpriseComplianceCards'), change_control: () => import('./EnterpriseComplianceCards'),
    segregation_of_duties: () => import('./EnterpriseComplianceCards'), compliance_reports: () => import('./EnterpriseComplianceCards'),
    nist_800_53: () => import('./EnterpriseComplianceCards'), stig_compliance: () => import('./EnterpriseComplianceCards'),
    air_gap_readiness: () => import('./EnterpriseComplianceCards'), fedramp_readiness: () => import('./EnterpriseComplianceCards'),
    oidc_federation: () => import('./EnterpriseComplianceCards'), rbac_audit: () => import('./EnterpriseComplianceCards'),
    session_management: () => import('./EnterpriseComplianceCards'), siem_integration: () => import('./EnterpriseComplianceCards'),
    incident_response: () => import('./EnterpriseComplianceCards'), threat_intel: () => import('./EnterpriseComplianceCards'),
    runtime_attestation: () => import('./RuntimeAttestationCard'), sbom_manager: () => import('./EnterpriseComplianceCards'),
    sigstore_verify: () => import('./EnterpriseComplianceCards'), slsa_provenance: () => import('./EnterpriseComplianceCards'),
    risk_matrix: () => import('./EnterpriseComplianceCards'), risk_register: () => import('./EnterpriseComplianceCards'),
    risk_appetite: () => import('./EnterpriseComplianceCards'), compliance_frameworks_dashboard: () => import('../compliance/ComplianceFrameworks'),
    change_control_dashboard: () => import('../compliance/ChangeControlAudit'), segregation_of_duties_dashboard: () => import('../compliance/SegregationOfDuties'),
    data_residency_dashboard: () => import('../compliance/DataResidency'), compliance_reports_dashboard: () => import('../compliance/ComplianceReports'),
    hipaa_dashboard: () => import('../compliance/HIPAADashboard'), gxp_dashboard: () => import('../compliance/GxPDashboard'),
    baa_dashboard: () => import('../compliance/BAADashboard'), nist_dashboard: () => import('../compliance/NISTDashboard'),
    stig_dashboard: () => import('../compliance/STIGDashboard'), airgap_dashboard: () => import('../compliance/AirGapDashboard'),
    fedramp_dashboard: () => import('../compliance/FedRAMPDashboard'), oidc_dashboard: () => import('../compliance/OIDCDashboard'),
    rbac_audit_dashboard: () => import('../compliance/RBACAuditDashboard'), session_dashboard: () => import('../compliance/SessionDashboard'),
    sbom_dashboard: () => import('../compliance/SBOMDashboard'), sigstore_dashboard: () => import('../compliance/SigstoreDashboard'),
    slsa_dashboard: () => import('../compliance/SLSADashboard'), risk_matrix_dashboard: () => import('../compliance/RiskMatrixDashboard'),
    risk_register_dashboard: () => import('../compliance/RiskRegisterDashboard'), risk_appetite_dashboard: () => import('../compliance/RiskAppetiteDashboard'),
    deployment_risk_score: () => import('./DeploymentRiskScore'), network_trace: () => import('./gadget/NetworkTraceCard'),
    dns_trace: () => import('./gadget/DNSTraceCard'), process_trace: () => import('./gadget/ProcessTraceCard'), security_audit: () => import('./gadget/SecurityAuditCard'),
  },
  defaultWidths: {
    security_issues: 4, alert_rules: 6, opa_policies: 6, kyverno_policies: 6, intoto_supply_chain: 6,
    falco_alerts: 4, iso27001_audit: 6, trestle_scan: 6, trivy_scan: 4, kubescape_scan: 4, policy_violations: 6,
    compliance_score: 4, fleet_compliance_heatmap: 6, compliance_drift: 5, cross_cluster_policy_comparison: 5,
    recommended_policies: 6, vault_secrets: 4, external_secrets: 4, cert_manager: 4, runtime_attestation: 6,
    deployment_risk_score: 6, hipaa_compliance: 4, gxp_validation: 4, baa_tracker: 4, compliance_frameworks: 8,
    data_residency: 6, change_control: 6, segregation_of_duties: 6, compliance_reports: 8, nist_800_53: 4,
    stig_compliance: 4, air_gap_readiness: 4, fedramp_readiness: 4, oidc_federation: 6, rbac_audit: 6,
    session_management: 6, siem_integration: 6, incident_response: 6, threat_intel: 6, sbom_manager: 6,
    sigstore_verify: 6, slsa_provenance: 6, risk_matrix: 4, risk_register: 6, risk_appetite: 4,
    compliance_frameworks_dashboard: 12, change_control_dashboard: 12, segregation_of_duties_dashboard: 12,
    data_residency_dashboard: 12, compliance_reports_dashboard: 12, hipaa_dashboard: 12, gxp_dashboard: 12,
    baa_dashboard: 12, nist_dashboard: 12, stig_dashboard: 12, airgap_dashboard: 12, fedramp_dashboard: 12,
    oidc_dashboard: 12, rbac_audit_dashboard: 12, session_dashboard: 12, sbom_dashboard: 12, sigstore_dashboard: 12,
    slsa_dashboard: 12, risk_matrix_dashboard: 12, risk_register_dashboard: 12, risk_appetite_dashboard: 12,
  },
  demoDataCards: ['falco_alerts', 'vault_secrets', 'external_secrets', 'deployment_risk_score'],
  liveDataCards: ['cert_manager', 'intoto_supply_chain'],
  demoStartupPreloaders: [() => import('./KyvernoPolicies'), () => import('./ComplianceCards'), () => import('./DataComplianceCards')],
}
