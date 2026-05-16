/**
 * Lazy-loaded route components.
 *
 * All page-level components are loaded via safeLazy() for code-splitting.
 * Login, AuthCallback, Clusters, and Dashboard are eagerly imported because
 * they are on the critical auth/landing path and must render without delay.
 *
 * Extracted from App.tsx to keep the root component focused on composition.
 */
import { safeLazy } from '../lib/safeLazy'
// Dashboard is the landing page — import eagerly to avoid Suspense delay on reload
import { Dashboard } from '../components/dashboard/Dashboard'
// Login and AuthCallback are eagerly imported — they are on the critical auth
// path and must render reliably.  Lazy-loading them caused chunk_load errors
// during OAuth redirects when the browser navigated away before the chunk
// finished downloading (#9803).
import { Login } from '../components/auth/Login'
import { AuthCallback } from '../components/auth/AuthCallback'
// Eagerly import key sidebar dashboards to prevent React Router's
// startTransition from keeping the old route visible during lazy loading.
import { Clusters } from '../components/clusters/Clusters'

export { Dashboard, Login, AuthCallback, Clusters }

export const MissionLandingPage = safeLazy(() => import('../components/missions/MissionLandingPage'), 'MissionLandingPage')

// Lazy-load DrillDownModal — the drilldown views (~64 KB) are only needed
// when a user clicks into a card detail, not on initial page render.
export const DrillDownModal = safeLazy(() => import('../components/drilldown/DrillDownModal'), 'DrillDownModal')

export const CustomDashboard = safeLazy(() => import('../components/dashboard/CustomDashboard'), 'CustomDashboard')
export const Settings = safeLazy(() => import('../components/settings/Settings'), 'Settings')
export const Events = safeLazy(() => import('../components/events/Events'), 'Events')
export const Workloads = safeLazy(() => import('../components/workloads/Workloads'), 'Workloads')
export const Storage = safeLazy(() => import('../components/storage/Storage'), 'Storage')
export const Compute = safeLazy(() => import('../components/compute/Compute'), 'Compute')
export const ClusterComparisonPage = safeLazy(() => import('../components/compute/ClusterComparisonPage'), 'ClusterComparisonPage')
export const Network = safeLazy(() => import('../components/network/Network'), 'Network')
export const Security = safeLazy(() => import('../components/security/Security'), 'Security')
export const GitOps = safeLazy(() => import('../components/gitops/GitOps'), 'GitOps')
export const Alerts = safeLazy(() => import('../components/alerts/Alerts'), 'Alerts')
export const Cost = safeLazy(() => import('../components/cost/Cost'), 'Cost')
export const Compliance = safeLazy(() => import('../components/compliance/Compliance'), 'Compliance')
export const ComplianceFrameworks = safeLazy(() => import('../components/compliance/ComplianceFrameworks'), 'default')
export const ChangeControlAudit = safeLazy(() => import('../components/compliance/ChangeControlAudit'), 'default')
export const SegregationOfDuties = safeLazy(() => import('../components/compliance/SegregationOfDuties'), 'default')
export const ComplianceReports = safeLazy(() => import('../components/compliance/ComplianceReports'), 'default')
export const DataResidency = safeLazy(() => import('../components/compliance/DataResidency'), 'default')
export const BAADashboard = safeLazy(() => import('../components/compliance/BAADashboard'), 'default')
export const HIPAADashboard = safeLazy(() => import('../components/compliance/HIPAADashboard'), 'default')
export const GxPDashboard = safeLazy(() => import('../components/compliance/GxPDashboard'), 'default')
export const NISTDashboard = safeLazy(() => import('../components/compliance/NISTDashboard'), 'default')
export const STIGDashboard = safeLazy(() => import('../components/compliance/STIGDashboard'), 'default')
export const AirGapDashboard = safeLazy(() => import('../components/compliance/AirGapDashboard'), 'default')
export const FedRAMPDashboard = safeLazy(() => import('../components/compliance/FedRAMPDashboard'), 'default')
export const OIDCDashboard = safeLazy(() => import('../components/compliance/OIDCDashboard'), 'default')
export const RBACAuditDashboard = safeLazy(() => import('../components/compliance/RBACAuditDashboard'), 'default')
export const SessionDashboard = safeLazy(() => import('../components/compliance/SessionDashboard'), 'default')
export const SIEMDashboard = safeLazy(() => import('../components/compliance/SIEMDashboard'), 'default')
export const IncidentResponseDashboard = safeLazy(() => import('../components/compliance/IncidentResponseDashboard'), 'default')
export const ThreatIntelDashboard = safeLazy(() => import('../components/compliance/ThreatIntelDashboard'), 'default')
export const SBOMDashboard = safeLazy(() => import('../components/compliance/SBOMDashboard'), 'default')
export const SigningStatusDashboard = safeLazy(() => import('../components/compliance/SigningStatusDashboard'), 'default')
export const SLSADashboard = safeLazy(() => import('../components/compliance/SLSADashboard'), 'default')
export const LicenseComplianceDashboard = safeLazy(() => import('../components/compliance/LicenseComplianceDashboard'), 'default')
export const RiskMatrixDashboard = safeLazy(() => import('../components/compliance/RiskMatrixDashboard'), 'default')
export const RiskRegisterDashboard = safeLazy(() => import('../components/compliance/RiskRegisterDashboard'), 'default')
export const RiskAppetiteDashboard = safeLazy(() => import('../components/compliance/RiskAppetiteDashboard'), 'default')
export const EnterpriseLayout = safeLazy(() => import('../components/enterprise/EnterpriseLayout'), 'default')
export const EnterprisePortal = safeLazy(() => import('../components/enterprise/EnterprisePortal'), 'default')
export const ComingSoon = safeLazy(() => import('../components/enterprise/ComingSoon'), 'default')
export const DataCompliance = safeLazy(() => import('../components/data-compliance/DataCompliance'), 'DataCompliance')
export const GPUReservations = safeLazy(() => import('../components/gpu/GPUReservations'), 'GPUReservations')
export const KarmadaOps = safeLazy(() => import('../components/karmada-ops/KarmadaOps'), 'KarmadaOps')
export const Nodes = safeLazy(() => import('../components/nodes/Nodes'), 'Nodes')
export const Deployments = safeLazy(() => import('../components/deployments/Deployments'), 'Deployments')
export const Services = safeLazy(() => import('../components/services/Services'), 'Services')
export const Operators = safeLazy(() => import('../components/operators/Operators'), 'Operators')
export const HelmReleases = safeLazy(() => import('../components/helm/HelmReleases'), 'HelmReleases')
export const Logs = safeLazy(() => import('../components/logs/Logs'), 'Logs')
export const Pods = safeLazy(() => import('../components/pods/Pods'), 'Pods')
export const CardHistory = safeLazy(() => import('../components/history/CardHistory'), 'CardHistory')
export const UserManagementPage = safeLazy(() => import('../pages/UserManagement'), 'UserManagementPage')
export const NamespaceManager = safeLazy(() => import('../components/namespaces/NamespaceManager'), 'NamespaceManager')
export const Arcade = safeLazy(() => import('../components/arcade/Arcade'), 'Arcade')
export const Deploy = safeLazy(() => import('../components/deploy/Deploy'), 'Deploy')
export const AIML = safeLazy(() => import('../components/aiml/AIML'), 'AIML')
export const AIAgents = safeLazy(() => import('../components/aiagents/AIAgents'), 'AIAgents')
export const LLMdBenchmarks = safeLazy(() => import('../components/llmd-benchmarks/LLMdBenchmarks'), 'LLMdBenchmarks')
export const ClusterAdmin = safeLazy(() => import('../components/cluster-admin/ClusterAdmin'), 'ClusterAdmin')
export const CICD = safeLazy(() => import('../components/cicd/CICD'), 'CICD')
export const Insights = safeLazy(() => import('../components/insights/Insights'), 'Insights')
export const MultiTenancy = safeLazy(() => import('../components/multi-tenancy/MultiTenancy'), 'MultiTenancy')
export const Drasi = safeLazy(() => import('../components/drasi/Drasi'), 'Drasi')
export const ACMM = safeLazy(() => import('../components/acmm/ACMM'), 'ACMM')
export const Marketplace = safeLazy(() => import('../components/marketplace/Marketplace'), 'Marketplace')
export const Quantum = safeLazy(() => import('../components/quantum/Quantum'), 'Quantum')
export const StellarPage = safeLazy(() => import('../components/stellar/StellarPage'), 'StellarPage')
export const AuditPage = safeLazy(() => import('../components/stellar/AuditPage'), 'AuditPage')
export const MiniDashboard = safeLazy(() => import('../components/widget/MiniDashboard'), 'MiniDashboard')
export const EmbedCard = safeLazy(() => import('../pages/EmbedCard'), 'EmbedCard')
export const Welcome = safeLazy(() => import('../pages/Welcome'), 'Welcome')
export const FromLens = safeLazy(() => import('../pages/FromLens'), 'FromLens')
export const FromHeadlamp = safeLazy(() => import('../pages/FromHeadlamp'), 'FromHeadlamp')
export const FromHolmesGPT = safeLazy(() => import('../pages/FromHolmesGPT'), 'FromHolmesGPT')
export const FeatureInspektorGadget = safeLazy(() => import('../pages/FeatureInspektorGadget'), 'FeatureInspektorGadget')
export const FeatureKagent = safeLazy(() => import('../pages/FeatureKagent'), 'FeatureKagent')
export const WhiteLabel = safeLazy(() => import('../pages/WhiteLabel'), 'WhiteLabel')
export const UnifiedCardTest = safeLazy(() => import('../pages/UnifiedCardTest'), 'UnifiedCardTest')
export const UnifiedStatsTest = safeLazy(() => import('../pages/UnifiedStatsTest'), 'UnifiedStatsTest')
export const UnifiedDashboardTest = safeLazy(() => import('../pages/UnifiedDashboardTest'), 'UnifiedDashboardTest')
export const AllCardsPerfTest = safeLazy(() => import('../pages/AllCardsPerfTest'), 'AllCardsPerfTest')
export const CompliancePerfTest = safeLazy(() => import('../pages/CompliancePerfTest'), 'CompliancePerfTest')
export const NotFound = safeLazy(() => import('../components/NotFound'), 'default')
