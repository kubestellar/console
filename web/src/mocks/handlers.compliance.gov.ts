import { http, HttpResponse, delay } from 'msw'
import {
  DEMO_10_MIN_MS,
  DEMO_12_HOUR_MS,
  DEMO_150_MIN_MS,
  DEMO_15_MIN_MS,
  DEMO_1_DAY_MS,
  DEMO_1_HOUR_MS,
  DEMO_1_MIN_MS,
  DEMO_1_WEEK_MS,
  DEMO_20_MIN_MS,
  DEMO_2_DAY_MS,
  DEMO_2_HOUR_MS,
  DEMO_2_MIN_MS,
  DEMO_30_DAY_MS,
  DEMO_30_MIN_MS,
  DEMO_30_SEC_MS,
  DEMO_3_DAY_MS,
  DEMO_3_HOUR_MS,
  DEMO_45_MIN_MS,
  DEMO_45_SEC_MS,
  DEMO_4_HOUR_MS,
  DEMO_50_MIN_MS,
  DEMO_5_MIN_MS,
  DEMO_75_MIN_MS,
  DEMO_90_MIN_MS,
} from './handlers.fixtures'

// NIST 800-53, DISA STIG, Air-Gap Readiness, FedRAMP, and Identity &
// Access mock handlers (demo mode).
export function createComplianceGovHandlers() {
  return [
  // ── NIST 800-53 mock handlers (demo mode) ─────────────────────────
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
  http.get('/api/compliance/stig/benchmarks', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'kubernetes-stig-v2r1', title: 'Kubernetes STIG', version: 'V2R1', release: 'Release 1', status: 'compliant', profile: 'MAC-I Classified', total_rules: 95, findings_count: 12 },
    ])
  }),

  http.get('/api/compliance/stig/findings', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'V-242381', rule_id: 'SV-242381r879578', title: 'API Server must have anonymous auth disabled', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'anonymous-auth=false verified on all API servers' },
      { id: 'V-242382', rule_id: 'SV-242382r879581', title: 'API Server must have audit logging enabled', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'Audit policy active with RequestResponse level' },
      { id: 'V-242383', rule_id: 'SV-242383r879584', title: 'etcd must use TLS encryption', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'TLS certs verified via --etcd-certfile' },
      { id: 'V-242395', rule_id: 'SV-242395r879620', title: 'Network policies must restrict pod traffic', severity: 'CAT II', status: 'open', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-03', comments: '2 namespaces missing default-deny policies' },
      { id: 'V-242400', rule_id: 'SV-242400r879635', title: 'Container images must be signed', severity: 'CAT II', status: 'open', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-01', comments: 'Admission controller not enforcing signatures' },
      { id: 'V-242402', rule_id: 'SV-242402r879641', title: 'Resource limits must be set on containers', severity: 'CAT III', status: 'open', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-02', comments: '12 pods in dev namespace missing resource limits' },
      { id: 'V-242410', rule_id: 'SV-242410r879660', title: 'RBAC must be enabled on the API server', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: '--authorization-mode includes RBAC' },
      { id: 'V-242415', rule_id: 'SV-242415r879675', title: 'Secrets must be encrypted at rest', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'EncryptionConfiguration with aescbc provider' },
      { id: 'V-242420', rule_id: 'SV-242420r879690', title: 'Kubelet must use TLS authentication', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-01', comments: 'Client cert auth verified' },
      { id: 'V-242425', rule_id: 'SV-242425r879705', title: 'Pod security standards must be enforced', severity: 'CAT II', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'PodSecurity admission enabled with restricted profile' },
      { id: 'V-242430', rule_id: 'SV-242430r879720', title: 'ServiceAccount token automounting must be disabled', severity: 'CAT II', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'automountServiceAccountToken: false set as default' },
      { id: 'V-242435', rule_id: 'SV-242435r879735', title: 'API server must use secure port only', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'Insecure port disabled, --secure-port=6443' },
    ])
  }),

  http.get('/api/compliance/stig/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      compliance_score: 75, total_findings: 12, open: 3,
      cat_i_open: 0, cat_ii_open: 2, cat_iii_open: 1,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // ── Air-Gap Readiness mock handlers (demo mode) ───────────────────
  http.get('/api/compliance/airgap/requirements', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'ag-01', category: 'registry', name: 'Private Container Registry', description: 'All images from internal registry.', status: 'ready', details: 'Harbor v2.9 deployed in-cluster at registry.internal:5000' },
      { id: 'ag-02', category: 'registry', name: 'Image Signature Verification', description: 'Images verified against local keyserver.', status: 'ready', details: 'Cosign admission controller enforcing signatures from internal keyserver' },
      { id: 'ag-03', category: 'dns', name: 'Internal DNS Resolution', description: 'CoreDNS internal only.', status: 'ready', details: 'CoreDNS configured with no upstream forwarders — all zones served internally' },
      { id: 'ag-04', category: 'ntp', name: 'Internal NTP Source', description: 'Time from internal NTP.', status: 'ready', details: 'Chrony syncing to internal GPS-disciplined NTP at 10.0.0.1' },
      { id: 'ag-05', category: 'updates', name: 'Offline Update Channel', description: 'Updates via internal repo.', status: 'partial', details: '85% of upstream repos mirrored to internal Nexus — remaining 15% are non-critical operator repos' },
      { id: 'ag-06', category: 'updates', name: 'Helm Chart Repository', description: 'ChartMuseum local.', status: 'ready', details: 'ChartMuseum serving 47 charts locally at helm.internal:8080' },
      { id: 'ag-07', category: 'telemetry', name: 'Telemetry Disabled', description: 'No outbound telemetry.', status: 'ready', details: 'Egress NetworkPolicy blocks all outbound traffic — verified via network audit' },
      { id: 'ag-08', category: 'telemetry', name: 'CRL/OCSP Offline', description: 'Local CRL cache.', status: 'not_ready', details: 'No local CRL distribution point deployed — certificates currently cannot be validated offline' },
      { id: 'ag-09', category: 'registry', name: 'Operator Catalog Mirror', description: 'OLM catalogs mirrored.', status: 'ready', details: '12 operator catalogs synced from upstream, served via internal catalog server' },
      { id: 'ag-10', category: 'dns', name: 'External Egress Blocked', description: 'All outbound blocked.', status: 'ready', details: 'Default-deny egress NetworkPolicy applied cluster-wide with allowlist for internal ranges only' },
    ])
  }),

  http.get('/api/compliance/airgap/clusters', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'ag-cluster-1', name: 'airgap-prod-east', readiness_score: 100, status: 'ready', requirements_met: 10, requirements_total: 10, last_checked: '2026-04-23T06:00:00Z' },
      { id: 'ag-cluster-2', name: 'airgap-prod-west', readiness_score: 100, status: 'ready', requirements_met: 10, requirements_total: 10, last_checked: '2026-04-23T06:00:00Z' },
      { id: 'ag-cluster-3', name: 'classified-central', readiness_score: 80, status: 'partial', requirements_met: 8, requirements_total: 10, last_checked: '2026-04-23T06:00:00Z' },
      { id: 'ag-cluster-4', name: 'staging-isolated', readiness_score: 70, status: 'not_ready', requirements_met: 7, requirements_total: 10, last_checked: '2026-04-23T06:00:00Z' },
    ])
  }),

  http.get('/api/compliance/airgap/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_requirements: 10, ready: 8, not_ready: 1, partial: 1,
      overall_readiness: 80,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // ── FedRAMP Readiness mock handlers (demo mode) ───────────────────
  http.get('/api/compliance/fedramp/controls', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'AC-1', name: 'Access Control Policy', description: 'Develop and maintain access control policy and procedures', family: 'AC', status: 'satisfied', responsible: 'CISO Office', implementation: 'Documented in security plan v3.2, reviewed quarterly' },
      { id: 'AC-2', name: 'Account Management', description: 'Manage system accounts including creation, modification, and removal', family: 'AC', status: 'satisfied', responsible: 'IAM Team', implementation: 'RBAC with OIDC integration via Keycloak, 30-day inactive purge' },
      { id: 'AC-6', name: 'Least Privilege', description: 'Employ the principle of least privilege for system access', family: 'AC', status: 'partially_satisfied', responsible: 'Platform Engineering', implementation: '80% of service accounts scoped — 3 legacy accounts pending reduction' },
      { id: 'AU-2', name: 'Audit Events', description: 'Determine and configure auditable events', family: 'AU', status: 'satisfied', responsible: 'Security Engineering', implementation: 'K8s API server audit policy covering all write operations' },
      { id: 'CA-7', name: 'Continuous Monitoring', description: 'Develop and implement continuous monitoring program', family: 'CA', status: 'satisfied', responsible: 'SecOps', implementation: 'Prometheus + Grafana with 90-day retention, real-time alerts' },
      { id: 'CM-6', name: 'Configuration Settings', description: 'Establish and enforce security configuration settings', family: 'CM', status: 'partially_satisfied', responsible: 'Platform Engineering', implementation: 'OPA Gatekeeper enforcing 85% of policies — 15% in audit mode' },
      { id: 'SC-7', name: 'Boundary Protection', description: 'Monitor and control communications at system boundaries', family: 'SC', status: 'satisfied', responsible: 'Network Engineering', implementation: 'NetworkPolicy + WAF + ingress rate limiting deployed' },
      { id: 'SI-2', name: 'Flaw Remediation', description: 'Identify, report, and correct system flaws in a timely manner', family: 'SI', status: 'partially_satisfied', responsible: 'DevOps', implementation: 'CVE scanning via Trivy — 90% within SLA, 10% lagging on low-severity' },
    ])
  }),

  http.get('/api/compliance/fedramp/poams', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'POAM-001', control_id: 'AC-6', title: 'Legacy service account privilege reduction', description: '3 legacy service accounts have overly broad ClusterRole bindings that need scoping down', milestone_status: 'open', scheduled_completion: '2026-06-30', risk_level: 'moderate', vendor_dependency: false },
      { id: 'POAM-002', control_id: 'CM-6', title: 'OPA policy enforcement gap', description: '15% of OPA/Gatekeeper policies are in audit-only mode and need enforcement', milestone_status: 'open', scheduled_completion: '2026-07-15', risk_level: 'low', vendor_dependency: false },
      { id: 'POAM-003', control_id: 'SI-2', title: 'CVE patching SLA compliance', description: 'Low-severity CVE patching exceeds 30-day SLA for 10% of findings', milestone_status: 'delayed', scheduled_completion: '2026-05-31', risk_level: 'moderate', vendor_dependency: true },
      { id: 'POAM-004', control_id: 'AU-12', title: 'Node-level audit logging', description: 'Audit logging incomplete on 2 worker nodes — kubelet audit config missing', milestone_status: 'closed', scheduled_completion: '2026-04-15', risk_level: 'low', vendor_dependency: false },
    ])
  }),

  http.get('/api/compliance/fedramp/score', async () => {
    await delay(150)
    return HttpResponse.json({
      overall_score: 85, authorization_status: 'in_progress', impact_level: 'moderate',
      controls_satisfied: 5, controls_partially_satisfied: 3, controls_planned: 0, controls_total: 8,
      poams_open: 3, poams_closed: 1,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // ── Identity & Access mock handlers (demo mode) ────────────
  http.get('/api/identity/oidc/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_providers: 5, active_providers: 4, total_users: 1247,
      active_sessions: 89, failed_logins_24h: 7, mfa_adoption: 82,
      evaluated_at: new Date().toISOString(),
    })
  }),
  http.get('/api/identity/oidc/providers', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'oidc-1', name: 'Okta Production', issuer_url: 'https://company.okta.com', status: 'connected', protocol: 'OIDC', client_id: 'okta-prod-001', users_synced: 485, last_sync: new Date(Date.now() - DEMO_5_MIN_MS).toISOString(), groups_mapped: 12 },
      { id: 'oidc-2', name: 'Azure AD', issuer_url: 'https://login.microsoftonline.com/tenant-id', status: 'connected', protocol: 'OIDC', client_id: 'azure-ad-001', users_synced: 312, last_sync: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), groups_mapped: 8 },
      { id: 'oidc-3', name: 'GitHub Enterprise', issuer_url: 'https://github.com/login/oauth', status: 'connected', protocol: 'OAuth2', client_id: 'gh-ent-001', users_synced: 198, last_sync: new Date(Date.now() - DEMO_15_MIN_MS).toISOString(), groups_mapped: 15 },
      { id: 'oidc-4', name: 'Google Workspace', issuer_url: 'https://accounts.google.com', status: 'connected', protocol: 'OIDC', client_id: 'gws-001', users_synced: 252, last_sync: new Date(Date.now() - DEMO_20_MIN_MS).toISOString(), groups_mapped: 6 },
      { id: 'oidc-5', name: 'Keycloak Staging', issuer_url: 'https://keycloak.staging.internal', status: 'degraded', protocol: 'OIDC', client_id: 'kc-staging-001', users_synced: 0, last_sync: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), groups_mapped: 3 },
    ])
  }),
  http.get('/api/identity/oidc/sessions', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'sess-1', user: 'alice@company.com', provider_id: 'oidc-1', provider_name: 'Okta Production', login_time: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_2_HOUR_MS).toISOString(), ip_address: '10.0.1.42', active: true },
      { id: 'sess-2', user: 'bob@company.com', provider_id: 'oidc-2', provider_name: 'Azure AD', login_time: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_1_HOUR_MS).toISOString(), ip_address: '10.0.2.18', active: true },
      { id: 'sess-3', user: 'carol@company.com', provider_id: 'oidc-3', provider_name: 'GitHub Enterprise', login_time: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_90_MIN_MS).toISOString(), ip_address: '10.0.1.55', active: true },
      { id: 'sess-4', user: 'dave@company.com', provider_id: 'oidc-1', provider_name: 'Okta Production', login_time: new Date(Date.now() - DEMO_90_MIN_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_30_MIN_MS).toISOString(), ip_address: '172.16.0.22', active: true },
      { id: 'sess-5', user: 'eve@company.com', provider_id: 'oidc-4', provider_name: 'Google Workspace', login_time: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_3_HOUR_MS).toISOString(), ip_address: '10.0.3.7', active: true },
      { id: 'sess-6', user: 'frank@company.com', provider_id: 'oidc-2', provider_name: 'Azure AD', login_time: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), expires_at: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), ip_address: '10.0.1.91', active: false },
      { id: 'sess-7', user: 'grace@company.com', provider_id: 'oidc-1', provider_name: 'Okta Production', login_time: new Date(Date.now() - DEMO_15_MIN_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_150_MIN_MS).toISOString(), ip_address: '192.168.1.14', active: true },
      { id: 'sess-8', user: 'hank@company.com', provider_id: 'oidc-3', provider_name: 'GitHub Enterprise', login_time: new Date(Date.now() - DEMO_45_MIN_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_75_MIN_MS).toISOString(), ip_address: '10.0.2.33', active: true },
    ])
  }),
  http.get('/api/identity/rbac/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_bindings: 147, cluster_role_bindings: 34,
      role_bindings: 113, over_privileged: 8,
      unused_bindings: 12, compliance_score: 78,
      evaluated_at: new Date().toISOString(),
    })
  }),
  http.get('/api/identity/rbac/bindings', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'rb-1', name: 'admin-binding', kind: 'ClusterRoleBinding', subject_kind: 'User', subject_name: 'alice@company.com', role_name: 'cluster-admin', namespace: '', cluster: 'prod-east', risk_level: 'critical', last_used: new Date(Date.now() - DEMO_1_DAY_MS).toISOString() },
      { id: 'rb-2', name: 'dev-edit-binding', kind: 'RoleBinding', subject_kind: 'Group', subject_name: 'developers', role_name: 'edit', namespace: 'app-dev', cluster: 'prod-east', risk_level: 'medium', last_used: new Date(Date.now() - DEMO_2_DAY_MS).toISOString() },
      { id: 'rb-3', name: 'ci-deploy', kind: 'RoleBinding', subject_kind: 'ServiceAccount', subject_name: 'ci-deployer', role_name: 'deploy-manager', namespace: 'ci-cd', cluster: 'prod-east', risk_level: 'high', last_used: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString() },
      { id: 'rb-4', name: 'monitoring-view', kind: 'ClusterRoleBinding', subject_kind: 'ServiceAccount', subject_name: 'prometheus', role_name: 'view', namespace: '', cluster: 'prod-west', risk_level: 'low', last_used: new Date(Date.now() - DEMO_5_MIN_MS).toISOString() },
      { id: 'rb-5', name: 'qa-edit-binding', kind: 'RoleBinding', subject_kind: 'Group', subject_name: 'qa-team', role_name: 'edit', namespace: 'qa', cluster: 'staging', risk_level: 'medium', last_used: new Date(Date.now() - DEMO_1_WEEK_MS).toISOString() },
      { id: 'rb-6', name: 'old-admin-binding', kind: 'ClusterRoleBinding', subject_kind: 'User', subject_name: 'former-admin@company.com', role_name: 'cluster-admin', namespace: '', cluster: 'prod-east', risk_level: 'critical', last_used: new Date(Date.now() - DEMO_30_DAY_MS).toISOString() },
      { id: 'rb-7', name: 'secrets-reader', kind: 'RoleBinding', subject_kind: 'ServiceAccount', subject_name: 'vault-agent', role_name: 'secret-reader', namespace: 'vault', cluster: 'prod-east', risk_level: 'high', last_used: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString() },
      { id: 'rb-8', name: 'ingress-controller', kind: 'ClusterRoleBinding', subject_kind: 'ServiceAccount', subject_name: 'nginx-ingress', role_name: 'ingress-nginx', namespace: '', cluster: 'prod-east', risk_level: 'medium', last_used: new Date(Date.now() - DEMO_10_MIN_MS).toISOString() },
      { id: 'rb-9', name: 'dev-readonly', kind: 'RoleBinding', subject_kind: 'Group', subject_name: 'interns', role_name: 'view', namespace: 'sandbox', cluster: 'staging', risk_level: 'low', last_used: new Date(Date.now() - DEMO_3_DAY_MS).toISOString() },
      { id: 'rb-10', name: 'backup-operator', kind: 'ClusterRoleBinding', subject_kind: 'ServiceAccount', subject_name: 'velero', role_name: 'backup-admin', namespace: '', cluster: 'prod-west', risk_level: 'high', last_used: new Date(Date.now() - DEMO_12_HOUR_MS).toISOString() },
      { id: 'rb-11', name: 'app-deployer', kind: 'RoleBinding', subject_kind: 'Group', subject_name: 'sre-team', role_name: 'admin', namespace: 'production', cluster: 'prod-east', risk_level: 'high', last_used: new Date(Date.now() - DEMO_30_MIN_MS).toISOString() },
      { id: 'rb-12', name: 'log-collector', kind: 'ClusterRoleBinding', subject_kind: 'ServiceAccount', subject_name: 'fluentd', role_name: 'log-reader', namespace: '', cluster: 'prod-east', risk_level: 'low', last_used: new Date(Date.now() - DEMO_2_MIN_MS).toISOString() },
    ])
  }),
  http.get('/api/identity/rbac/findings', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'find-1', finding_type: 'cluster_admin_user', severity: 'critical', subject: 'alice@company.com', description: 'User has cluster-admin role bound directly. This grants unrestricted access to all resources.', cluster: 'prod-east', namespace: '*', recommendation: 'Replace with scoped roles targeting specific namespaces and resources.' },
      { id: 'find-2', finding_type: 'stale_binding', severity: 'high', subject: 'former-admin@company.com', description: 'ClusterRoleBinding for cluster-admin has not been used in 30+ days. User may have left the organization.', cluster: 'prod-east', namespace: '*', recommendation: 'Remove the binding and verify user employment status.' },
      { id: 'find-3', finding_type: 'wildcard_resource', severity: 'high', subject: 'ci-deployer', description: 'ServiceAccount has wildcard resource permissions in the ci-cd namespace.', cluster: 'prod-east', namespace: 'ci-cd', recommendation: 'Restrict to specific resource types: deployments, services, configmaps.' },
      { id: 'find-4', finding_type: 'excessive_secrets_access', severity: 'medium', subject: 'developers', description: 'Group "developers" can list and read secrets in the app-dev namespace.', cluster: 'prod-east', namespace: 'app-dev', recommendation: 'Use CSI secret store driver instead of direct secret access.' },
      { id: 'find-5', finding_type: 'unused_binding', severity: 'medium', subject: 'interns', description: 'RoleBinding for "interns" group has not been used in 3+ days. May indicate stale permissions.', cluster: 'staging', namespace: 'sandbox', recommendation: 'Review and remove if no longer needed.' },
      { id: 'find-6', finding_type: 'broad_namespace_admin', severity: 'high', subject: 'sre-team', description: 'Group has admin role in production namespace, granting full control including RBAC modification.', cluster: 'prod-east', namespace: 'production', recommendation: 'Use edit role instead and manage RBAC separately through policy.' },
    ])
  }),
  http.get('/api/identity/sessions/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      active_sessions: 42, unique_users: 31, avg_duration_minutes: 47,
      sessions_terminated_24h: 15, policy_violations: 3,
      mfa_sessions_pct: 88, evaluated_at: new Date().toISOString(),
    })
  }),
  http.get('/api/identity/sessions/active', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'as-1', user: 'alice@company.com', login_time: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_2_MIN_MS).toISOString(), ip_address: '10.0.1.42', user_agent: 'Chrome/125 (macOS)', provider: 'Okta', status: 'active', expires_at: new Date(Date.now() + DEMO_2_HOUR_MS).toISOString() },
      { id: 'as-2', user: 'bob@company.com', login_time: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), ip_address: '10.0.2.18', user_agent: 'Firefox/128 (Linux)', provider: 'Azure AD', status: 'idle', expires_at: new Date(Date.now() + DEMO_1_HOUR_MS).toISOString() },
      { id: 'as-3', user: 'carol@company.com', login_time: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_1_MIN_MS).toISOString(), ip_address: '10.0.1.55', user_agent: 'Safari/18 (macOS)', provider: 'GitHub', status: 'active', expires_at: new Date(Date.now() + DEMO_90_MIN_MS).toISOString() },
      { id: 'as-4', user: 'dave@company.com', login_time: new Date(Date.now() - DEMO_90_MIN_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_50_MIN_MS).toISOString(), ip_address: '172.16.0.22', user_agent: 'kubectl/v1.30 (linux/amd64)', provider: 'Okta', status: 'idle', expires_at: new Date(Date.now() + DEMO_30_MIN_MS).toISOString() },
      { id: 'as-5', user: 'eve@company.com', login_time: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_30_SEC_MS).toISOString(), ip_address: '10.0.3.7', user_agent: 'Chrome/125 (Windows)', provider: 'Google', status: 'active', expires_at: new Date(Date.now() + DEMO_3_HOUR_MS).toISOString() },
      { id: 'as-6', user: 'frank@company.com', login_time: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), ip_address: '10.0.1.91', user_agent: 'Edge/125 (Windows)', provider: 'Azure AD', status: 'expired', expires_at: new Date(Date.now() - DEMO_30_MIN_MS).toISOString() },
      { id: 'as-7', user: 'grace@company.com', login_time: new Date(Date.now() - DEMO_15_MIN_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_45_SEC_MS).toISOString(), ip_address: '192.168.1.14', user_agent: 'Chrome/125 (macOS)', provider: 'Okta', status: 'active', expires_at: new Date(Date.now() + DEMO_150_MIN_MS).toISOString() },
      { id: 'as-8', user: 'hank@company.com', login_time: new Date(Date.now() - DEMO_45_MIN_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), ip_address: '10.0.2.33', user_agent: 'kubectl/v1.31 (darwin/arm64)', provider: 'GitHub', status: 'active', expires_at: new Date(Date.now() + DEMO_75_MIN_MS).toISOString() },
    ])
  }),
  http.get('/api/identity/sessions/policies', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'pol-1', name: 'Default Session Policy', description: 'Standard session timeouts for all users', idle_timeout_minutes: 30, absolute_timeout_hours: 8, max_concurrent: 3, enforce_mfa: true, scope: 'global' },
      { id: 'pol-2', name: 'Admin Session Policy', description: 'Stricter timeouts for cluster administrators', idle_timeout_minutes: 15, absolute_timeout_hours: 4, max_concurrent: 1, enforce_mfa: true, scope: 'admin' },
      { id: 'pol-3', name: 'Service Account Policy', description: 'Long-lived sessions for automation and CI/CD', idle_timeout_minutes: 120, absolute_timeout_hours: 24, max_concurrent: 10, enforce_mfa: false, scope: 'service-accounts' },
    ])
  }),

]
}
