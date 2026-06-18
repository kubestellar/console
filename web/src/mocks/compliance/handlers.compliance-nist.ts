import { http, HttpResponse, delay } from 'msw'
import {
  pruneRegistry,
  savedCards,
  DEMO_30_SEC_MS,
  DEMO_45_SEC_MS,
  DEMO_1_MIN_MS,
  DEMO_90_SEC_MS,
  DEMO_2_MIN_MS,
  DEMO_150_SEC_MS,
  DEMO_3_MIN_MS,
  DEMO_4_MIN_MS,
  DEMO_5_MIN_MS,
  DEMO_6_MIN_MS,
  DEMO_7_MIN_MS,
  DEMO_8_MIN_MS,
  DEMO_10_MIN_MS,
  DEMO_15_MIN_MS,
  DEMO_20_MIN_MS,
  DEMO_30_MIN_MS,
  DEMO_45_MIN_MS,
  DEMO_50_MIN_MS,
  DEMO_1_HOUR_MS,
  DEMO_75_MIN_MS,
  DEMO_90_MIN_MS,
  DEMO_2_HOUR_MS,
  DEMO_150_MIN_MS,
  DEMO_3_HOUR_MS,
  DEMO_4_HOUR_MS,
  DEMO_8_HOUR_MS,
  DEMO_12_HOUR_MS,
  DEMO_1_DAY_MS,
  DEMO_2_DAY_MS,
  DEMO_3_DAY_MS,
  DEMO_1_WEEK_MS,
  DEMO_30_DAY_MS,
} from './handlers.fixtures'



export function createComplianceNistHandlers() {
  return [
  http.get('/api/compliance/nist/families', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'AC', name: 'Access Control', description: 'Manage system access and privileges.', pass_rate: 83, controls: [
        { id: 'AC-2', name: 'Account Management', description: 'Manage information system accounts.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'Kubernetes RBAC with OIDC provider', remediation: '' },
        { id: 'AC-3', name: 'Access Enforcement', description: 'Enforce approved authorizations.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'NetworkPolicy + RBAC', remediation: '' },
        { id: 'AC-6', name: 'Least Privilege', description: 'Employ least privilege.', priority: 'P1', baseline: 'low', status: 'partial', evidence: '80% scoped', remediation: 'Audit legacy service accounts' },
        { id: 'AC-17', name: 'Remote Access', description: 'Manage remote access sessions.', priority: 'P1', baseline: 'moderate', status: 'implemented', evidence: 'VPN + mTLS', remediation: '' },
      ]},
      { id: 'AU', name: 'Audit and Accountability', description: 'Create, protect, and retain audit records.', pass_rate: 87, controls: [
        { id: 'AU-2', name: 'Audit Events', description: 'Determine auditable events.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'API server audit policy', remediation: '' },
        { id: 'AU-3', name: 'Content of Audit Records', description: 'Records contain required info.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'Structured JSON audit logs', remediation: '' },
        { id: 'AU-6', name: 'Audit Review', description: 'Review and analyze audit records.', priority: 'P1', baseline: 'low', status: 'partial', evidence: 'SIEM covers 60%', remediation: 'Expand alert rules' },
        { id: 'AU-12', name: 'Audit Generation', description: 'Provide audit record generation.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'Fluentd on all nodes', remediation: '' },
      ]},
      { id: 'SC', name: 'System and Communications Protection', description: 'Protect communications and boundaries.', pass_rate: 87, controls: [
        { id: 'SC-7', name: 'Boundary Protection', description: 'Monitor communications at boundaries.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'NetworkPolicy + WAF', remediation: '' },
        { id: 'SC-8', name: 'Transmission Confidentiality', description: 'Protect transmitted information.', priority: 'P1', baseline: 'moderate', status: 'implemented', evidence: 'Service mesh mTLS', remediation: '' },
        { id: 'SC-12', name: 'Cryptographic Key Management', description: 'Manage cryptographic keys.', priority: 'P1', baseline: 'low', status: 'partial', evidence: '80% rotation', remediation: 'Enable etcd key rotation' },
        { id: 'SC-28', name: 'Protection at Rest', description: 'Protect information at rest.', priority: 'P1', baseline: 'moderate', status: 'implemented', evidence: 'etcd AES-256-GCM', remediation: '' },
      ]},
      { id: 'CM', name: 'Configuration Management', description: 'Establish baselines and manage changes.', pass_rate: 87, controls: [
        { id: 'CM-2', name: 'Baseline Configuration', description: 'Maintain baselines.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'GitOps with Flux', remediation: '' },
        { id: 'CM-6', name: 'Configuration Settings', description: 'Establish mandatory settings.', priority: 'P1', baseline: 'low', status: 'partial', evidence: 'OPA 85%', remediation: 'Deploy remaining templates' },
        { id: 'CM-7', name: 'Least Functionality', description: 'Only essential capabilities.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'Minimal images', remediation: '' },
        { id: 'CM-8', name: 'Component Inventory', description: 'Maintain component inventory.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'SBOM via Syft', remediation: '' },
      ]},
      { id: 'IR', name: 'Incident Response', description: 'Prepare for and respond to incidents.', pass_rate: 66, controls: [
        { id: 'IR-4', name: 'Incident Handling', description: 'Implement incident handling.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'PagerDuty + runbooks', remediation: '' },
        { id: 'IR-5', name: 'Incident Monitoring', description: 'Track security incidents.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'JIRA tracking', remediation: '' },
        { id: 'IR-6', name: 'Incident Reporting', description: 'Report to authorities.', priority: 'P1', baseline: 'low', status: 'planned', evidence: '', remediation: 'Implement FedRAMP POAM reporting' },
      ]},
    ])
  }),

  http.get('/api/compliance/nist/mappings', async () => {
    await delay(150)
    return HttpResponse.json([
      { control_id: 'AC-2', resources: ['ServiceAccount', 'ClusterRoleBinding'], namespaces: ['kube-system', 'production'], clusters: ['prod-east', 'prod-west'], automated: true, last_assessed: new Date().toISOString() },
      { control_id: 'AC-3', resources: ['NetworkPolicy', 'Role', 'RoleBinding'], namespaces: ['*'], clusters: ['prod-east', 'prod-west', 'staging'], automated: true, last_assessed: new Date().toISOString() },
      { control_id: 'SC-7', resources: ['NetworkPolicy', 'Ingress'], namespaces: ['*'], clusters: ['prod-east', 'prod-west'], automated: true, last_assessed: new Date().toISOString() },
      { control_id: 'CM-2', resources: ['GitRepository', 'Kustomization'], namespaces: ['flux-system'], clusters: ['prod-east', 'prod-west', 'staging'], automated: true, last_assessed: new Date().toISOString() },
      { control_id: 'AU-2', resources: ['AuditPolicy'], namespaces: ['kube-system'], clusters: ['prod-east', 'prod-west'], automated: true, last_assessed: new Date().toISOString() },
    ])
  }),

  http.get('/api/compliance/nist/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_controls: 19, implemented_controls: 13, partial_controls: 4,
      planned_controls: 1, not_applicable: 1, overall_score: 81,
      baseline: 'moderate', evaluated_at: new Date().toISOString(),
    })
  }),

  // ── DISA STIG mock handlers (demo mode) ───────────────────────────
  ]
}
