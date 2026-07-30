import { http, HttpResponse, delay } from 'msw'

// Compliance Frameworks, HIPAA, GxP, BAA, Segregation of Duties,
// Change Control, and Data Residency mock handlers (demo mode).
export function createComplianceFrameworkHandlers() {
  return [
  // ── Compliance Frameworks ──────────────────────────────────────────
  http.get('/api/compliance/frameworks/', async () => {
    await delay(150)
    return HttpResponse.json([
      {
        id: 'pci-dss-4.0',
        name: 'PCI-DSS 4.0',
        version: '4.0',
        description: 'Payment Card Industry Data Security Standard — protects cardholder data across networks, applications, and storage.',
        category: 'Financial',
        controls: 12,
        checks: 42,
      },
      {
        id: 'soc2-type2',
        name: 'SOC 2 Type II',
        version: '2024',
        description: 'Service Organization Control 2 — trust service criteria for security, availability, and confidentiality.',
        category: 'Financial',
        controls: 9,
        checks: 31,
      },
      {
        id: 'hipaa-security',
        name: 'HIPAA Security Rule',
        version: '2024',
        description: 'Health Insurance Portability and Accountability Act — technical safeguards for electronic protected health information.',
        category: 'Healthcare',
        controls: 5,
        checks: 18,
      },
      {
        id: 'nist-800-53',
        name: 'NIST 800-53 Rev 5',
        version: 'Rev 5',
        description: 'Security and Privacy Controls for Information Systems and Organizations.',
        category: 'Government',
        controls: 20,
        checks: 56,
      },
    ])
  }),

  http.post('/api/compliance/frameworks/:id/evaluate', async ({ params }) => {
    await delay(300)
    const fwId = params.id as string
    const fwNames: Record<string, string> = {
      'pci-dss-4.0': 'PCI-DSS 4.0',
      'soc2-type2': 'SOC 2 Type II',
      'hipaa-security': 'HIPAA Security Rule',
      'nist-800-53': 'NIST 800-53 Rev 5',
    }
    return HttpResponse.json({
      framework_id: fwId,
      framework_name: fwNames[fwId] ?? fwId,
      cluster: 'prod-east',
      score: 78,
      passed: 28,
      failed: 6,
      partial: 5,
      skipped: 3,
      total_checks: 42,
      controls: [
        {
          id: 'req-1', name: 'Network Segmentation', status: 'pass',
          checks: [
            { id: 'c1', name: 'NetworkPolicy coverage', type: 'kubernetes', status: 'pass', message: 'All namespaces have NetworkPolicies', remediation: '', severity: 'high' },
            { id: 'c2', name: 'Default deny ingress', type: 'kubernetes', status: 'pass', message: 'Default deny policies in place', remediation: '', severity: 'high' },
          ],
        },
        {
          id: 'req-3', name: 'Protect Stored Data', status: 'partial',
          checks: [
            { id: 'c3', name: 'Encryption at rest', type: 'kubernetes', status: 'pass', message: 'etcd encryption enabled', remediation: '', severity: 'critical' },
            { id: 'c4', name: 'Secret management', type: 'kubernetes', status: 'fail', message: '3 secrets stored as plain text', remediation: 'Migrate to external secret store (Vault, AWS SM)', severity: 'critical' },
          ],
        },
        {
          id: 'req-7', name: 'Restrict Access', status: 'fail',
          checks: [
            { id: 'c5', name: 'RBAC least privilege', type: 'kubernetes', status: 'fail', message: '2 ClusterRoleBindings grant cluster-admin to non-admin users', remediation: 'Replace cluster-admin with scoped roles', severity: 'critical' },
            { id: 'c6', name: 'Service account tokens', type: 'kubernetes', status: 'partial', message: '5 of 12 service accounts auto-mount tokens', remediation: 'Set automountServiceAccountToken: false', severity: 'medium' },
          ],
        },
        {
          id: 'req-10', name: 'Logging and Monitoring', status: 'pass',
          checks: [
            { id: 'c7', name: 'Audit logging enabled', type: 'kubernetes', status: 'pass', message: 'API server audit logging active', remediation: '', severity: 'high' },
            { id: 'c8', name: 'Log retention', type: 'kubernetes', status: 'pass', message: 'Logs retained for 90 days', remediation: '', severity: 'medium' },
          ],
        },
      ],
      evaluated_at: new Date().toISOString(),
    })
  }),

  http.post('/api/compliance/frameworks/:id/report', async () => {
    await delay(500)
    const reportContent = JSON.stringify({
      report: 'demo-compliance-report',
      generated_at: new Date().toISOString(),
      summary: 'Demo mode — install locally for real compliance reports.',
    }, null, 2)
    return new HttpResponse(reportContent, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="compliance-report-demo.json"',
      },
    })
  }),

  // HIPAA compliance mock handlers (demo mode)
  http.get('/api/compliance/hipaa/safeguards', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: '164.312(a)', section: '§164.312(a)(1)', name: 'Access Control', description: 'Implement technical policies to allow access only to authorized persons.', status: 'pass', checks: [
        { id: 'ac-1', name: 'RBAC enforced on PHI namespaces', description: 'Verify RBAC restricts PHI namespace access', status: 'pass', evidence: 'All 4 PHI namespaces have RBAC policies', remediation: '' },
        { id: 'ac-2', name: 'Unique user identification', description: 'Each user has a unique identifier', status: 'pass', evidence: 'OIDC provider enforces unique subject claims', remediation: '' },
        { id: 'ac-3', name: 'Emergency access procedure', description: 'Break-glass procedure documented and tested', status: 'pass', evidence: 'Break-glass ServiceAccount with audit trail configured', remediation: '' },
      ]},
      { id: '164.312(b)', section: '§164.312(b)', name: 'Audit Controls', description: 'Record and examine activity in systems containing PHI.', status: 'partial', checks: [
        { id: 'au-1', name: 'Kubernetes audit logging', description: 'API server audit policy captures PHI access', status: 'pass', evidence: 'Audit policy with RequestResponse level for PHI namespaces', remediation: '' },
        { id: 'au-2', name: 'Log retention 6+ years', description: 'Audit logs retained per HIPAA requirement', status: 'fail', evidence: 'Current retention: 90 days', remediation: 'Extend log retention to minimum 6 years via S3 lifecycle policy' },
        { id: 'au-3', name: 'Tamper-proof log storage', description: 'Logs stored in immutable storage', status: 'pass', evidence: 'S3 Object Lock enabled on audit bucket', remediation: '' },
      ]},
      { id: '164.312(c)', section: '§164.312(c)(1)', name: 'Integrity Controls', description: 'Protect PHI from improper alteration or destruction.', status: 'pass', checks: [
        { id: 'ic-1', name: 'Image signature verification', description: 'Container images signed and verified', status: 'pass', evidence: 'Cosign verification policy enforced', remediation: '' },
        { id: 'ic-2', name: 'Immutable container filesystem', description: 'Read-only root filesystem', status: 'pass', evidence: 'readOnlyRootFilesystem=true on all PHI pods', remediation: '' },
      ]},
      { id: '164.312(d)', section: '§164.312(d)', name: 'Person or Entity Authentication', description: 'Verify identity of persons seeking access to PHI.', status: 'partial', checks: [
        { id: 'pa-1', name: 'Multi-factor authentication', description: 'MFA required for PHI system access', status: 'pass', evidence: 'OIDC provider enforces MFA', remediation: '' },
        { id: 'pa-2', name: 'Service account rotation', description: 'Service account tokens rotated regularly', status: 'partial', evidence: '3 of 5 service accounts use projected tokens', remediation: 'Migrate remaining 2 to projected volume tokens' },
      ]},
      { id: '164.312(e)', section: '§164.312(e)(1)', name: 'Transmission Security', description: 'Guard against unauthorized access to PHI during transmission.', status: 'fail', checks: [
        { id: 'ts-1', name: 'TLS 1.2+ on all endpoints', description: 'All services use TLS 1.2 or higher', status: 'pass', evidence: 'Ingress controller configured with minimum TLS 1.2', remediation: '' },
        { id: 'ts-2', name: 'Mutual TLS between services', description: 'Service mesh enforces mTLS', status: 'fail', evidence: '2 of 6 PHI data flows lack mTLS', remediation: 'Enable Istio strict mTLS policy for PHI namespaces' },
        { id: 'ts-3', name: 'Encryption of PHI at rest', description: 'etcd and PV encryption enabled', status: 'pass', evidence: 'etcd encryption provider configured', remediation: '' },
      ]},
    ])
  }),

  http.get('/api/compliance/hipaa/phi-namespaces', async () => {
    await delay(150)
    return HttpResponse.json([
      { name: 'ehr-api', cluster: 'prod-east', labels: ['hipaa-phi=true', 'data-class=restricted'], encrypted: true, audit_enabled: true, rbac_restricted: true, compliant: true },
      { name: 'patient-records', cluster: 'prod-east', labels: ['hipaa-phi=true', 'data-class=restricted'], encrypted: true, audit_enabled: true, rbac_restricted: true, compliant: true },
      { name: 'lab-results', cluster: 'prod-west', labels: ['hipaa-phi=true', 'data-class=sensitive'], encrypted: true, audit_enabled: true, rbac_restricted: false, compliant: false },
      { name: 'billing-phi', cluster: 'prod-west', labels: ['hipaa-phi=true', 'data-class=restricted'], encrypted: true, audit_enabled: false, rbac_restricted: true, compliant: false },
    ])
  }),

  http.get('/api/compliance/hipaa/data-flows', async () => {
    await delay(150)
    return HttpResponse.json([
      { source: 'ehr-api', destination: 'patient-records', protocol: 'gRPC', encrypted: true, mutual_tls: true },
      { source: 'ehr-api', destination: 'lab-results', protocol: 'REST/HTTPS', encrypted: true, mutual_tls: true },
      { source: 'patient-records', destination: 'billing-phi', protocol: 'REST/HTTPS', encrypted: true, mutual_tls: false },
      { source: 'lab-results', destination: 'billing-phi', protocol: 'REST/HTTPS', encrypted: true, mutual_tls: false },
      { source: 'ehr-api', destination: 'analytics-deid', protocol: 'Kafka/TLS', encrypted: true, mutual_tls: true },
      { source: 'billing-phi', destination: 'claims-export', protocol: 'SFTP', encrypted: false, mutual_tls: false },
    ])
  }),

  http.get('/api/compliance/hipaa/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      overall_score: 60, safeguards_passed: 2, safeguards_failed: 1,
      safeguards_partial: 2, total_safeguards: 5, phi_namespaces: 4,
      compliant_namespaces: 2, data_flows: 6, encrypted_flows: 5,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // GxP / 21 CFR Part 11 mock handlers (demo mode)
  http.get('/api/compliance/gxp/config', async () => {
    await delay(150)
    return HttpResponse.json({
      enabled: true, enabled_at: '2026-04-20T08:00:00Z', enabled_by: 'admin@pharma.example.com',
      append_only: true, require_signature: true, hash_algorithm: 'SHA-256',
    })
  }),

  http.get('/api/compliance/gxp/records', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'gxp-001', timestamp: '2026-04-20T08:01:00Z', user_id: 'admin@pharma.example.com', action: 'config_change', resource: 'gxp-mode', detail: 'GxP validation mode enabled', previous_hash: '', record_hash: 'a1b2c3d4e5f6a7b8' },
      { id: 'gxp-002', timestamp: '2026-04-20T09:15:00Z', user_id: 'eng1@pharma.example.com', action: 'deploy', resource: 'ehr-api/v2.3.1', detail: 'Deployment to prod-east', previous_hash: 'a1b2c3d4e5f6a7b8', record_hash: 'b2c3d4e5f6a7b8c9' },
      { id: 'gxp-003', timestamp: '2026-04-20T09:16:00Z', user_id: 'qa-lead@pharma.example.com', action: 'review', resource: 'ehr-api/v2.3.1', detail: 'QA review passed — IQ/OQ/PQ complete', previous_hash: 'b2c3d4e5f6a7b8c9', record_hash: 'c3d4e5f6a7b8c9d0' },
      { id: 'gxp-004', timestamp: '2026-04-21T11:30:00Z', user_id: 'eng2@pharma.example.com', action: 'deploy', resource: 'lab-results/v1.8.0', detail: 'Deployment to prod-west', previous_hash: 'c3d4e5f6a7b8c9d0', record_hash: 'd4e5f6a7b8c9d0e1' },
      { id: 'gxp-005', timestamp: '2026-04-21T14:00:00Z', user_id: 'admin@pharma.example.com', action: 'config_change', resource: 'rbac', detail: 'Added ServiceAccount lab-etl-sa', previous_hash: 'd4e5f6a7b8c9d0e1', record_hash: 'e5f6a7b8c9d0e1f2' },
      { id: 'gxp-006', timestamp: '2026-04-22T08:45:00Z', user_id: 'eng1@pharma.example.com', action: 'deploy', resource: 'patient-records/v3.1.2', detail: 'Hotfix — security patch CVE-2026-1234', previous_hash: 'e5f6a7b8c9d0e1f2', record_hash: 'f6a7b8c9d0e1f2a3' },
      { id: 'gxp-007', timestamp: '2026-04-22T10:00:00Z', user_id: 'qa-lead@pharma.example.com', action: 'review', resource: 'patient-records/v3.1.2', detail: 'Emergency change review — approved', previous_hash: 'f6a7b8c9d0e1f2a3', record_hash: 'a7b8c9d0e1f2a3b4' },
      { id: 'gxp-008', timestamp: '2026-04-23T07:00:00Z', user_id: 'eng2@pharma.example.com', action: 'deploy', resource: 'billing-phi/v2.0.0', detail: 'Major version deployment', previous_hash: 'a7b8c9d0e1f2a3b4', record_hash: 'b8c9d0e1f2a3b4c5' },
    ])
  }),

  http.get('/api/compliance/gxp/signatures', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'sig-001', record_id: 'gxp-001', user_id: 'admin@pharma.example.com', meaning: 'approved', auth_method: 'mfa', timestamp: '2026-04-20T08:02:00Z' },
      { id: 'sig-002', record_id: 'gxp-002', user_id: 'qa-lead@pharma.example.com', meaning: 'approved', auth_method: 'mfa', timestamp: '2026-04-20T09:20:00Z' },
      { id: 'sig-003', record_id: 'gxp-003', user_id: 'qa-lead@pharma.example.com', meaning: 'reviewed', auth_method: 'password', timestamp: '2026-04-20T09:17:00Z' },
      { id: 'sig-004', record_id: 'gxp-004', user_id: 'qa-lead@pharma.example.com', meaning: 'approved', auth_method: 'mfa', timestamp: '2026-04-21T12:00:00Z' },
      { id: 'sig-005', record_id: 'gxp-005', user_id: 'admin@pharma.example.com', meaning: 'approved', auth_method: 'mfa', timestamp: '2026-04-21T14:05:00Z' },
      { id: 'sig-006', record_id: 'gxp-006', user_id: 'qa-lead@pharma.example.com', meaning: 'verified', auth_method: 'mfa', timestamp: '2026-04-22T09:00:00Z' },
      { id: 'sig-007', record_id: 'gxp-007', user_id: 'admin@pharma.example.com', meaning: 'approved', auth_method: 'certificate', timestamp: '2026-04-22T10:05:00Z' },
    ])
  }),

  http.get('/api/compliance/gxp/chain/verify', async () => {
    await delay(200)
    return HttpResponse.json({
      valid: true, total_records: 8, verified_records: 8, broken_at_index: -1,
      verified_at: new Date().toISOString(), message: 'Hash chain intact — all records verified',
    })
  }),

  http.get('/api/compliance/gxp/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      config: { enabled: true, enabled_at: '2026-04-20T08:00:00Z', enabled_by: 'admin@pharma.example.com', append_only: true, require_signature: true, hash_algorithm: 'SHA-256' },
      total_records: 8, total_signatures: 7, chain_integrity: true,
      last_verified: new Date().toISOString(), pending_signatures: 1,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // BAA Tracker mock handlers (demo mode)
  http.get('/api/compliance/baa/agreements', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'baa-001', provider: 'Amazon Web Services', provider_type: 'cloud', baa_signed_date: '2025-06-15', baa_expiry_date: '2027-06-15', covered_clusters: ['prod-east', 'staging-east'], contact_name: 'AWS Enterprise Support', contact_email: 'aws-baa@example.com', status: 'active', notes: 'Covers all HIPAA-eligible services in us-east-1' },
      { id: 'baa-002', provider: 'Google Cloud Platform', provider_type: 'cloud', baa_signed_date: '2025-08-01', baa_expiry_date: '2026-08-01', covered_clusters: ['prod-west'], contact_name: 'GCP Healthcare Team', contact_email: 'gcp-baa@example.com', status: 'active', notes: 'Covers GKE, Cloud SQL, BigQuery in us-west1' },
      { id: 'baa-003', provider: 'Datadog', provider_type: 'saas', baa_signed_date: '2025-03-01', baa_expiry_date: '2026-05-15', covered_clusters: ['prod-east', 'prod-west'], contact_name: 'Datadog Compliance', contact_email: 'compliance@datadog.example.com', status: 'expiring_soon', notes: 'Monitoring and logging for PHI workloads' },
      { id: 'baa-004', provider: 'Snowflake', provider_type: 'saas', baa_signed_date: '2024-01-01', baa_expiry_date: '2026-01-01', covered_clusters: [], contact_name: 'Snowflake Legal', contact_email: 'legal@snowflake.example.com', status: 'expired', notes: 'Analytics warehouse — BAA lapsed' },
      { id: 'baa-005', provider: 'Acme Consulting', provider_type: 'consulting', baa_signed_date: '', baa_expiry_date: '', covered_clusters: ['dev-central'], contact_name: 'Acme PM', contact_email: 'pm@acme.example.com', status: 'pending', notes: 'BAA under legal review' },
      { id: 'baa-006', provider: 'Azure', provider_type: 'cloud', baa_signed_date: '2025-11-01', baa_expiry_date: '2027-11-01', covered_clusters: ['dr-central'], contact_name: 'Microsoft Enterprise', contact_email: 'azure-baa@example.com', status: 'active', notes: 'Disaster recovery in Central US' },
    ])
  }),

  http.get('/api/compliance/baa/alerts', async () => {
    await delay(150)
    return HttpResponse.json([
      { agreement_id: 'baa-003', provider: 'Datadog', expiry_date: '2026-05-15', days_left: 22, severity: 'critical' },
      { agreement_id: 'baa-004', provider: 'Snowflake', expiry_date: '2026-01-01', days_left: 0, severity: 'critical' },
    ])
  }),

  http.get('/api/compliance/baa/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_agreements: 6, active_agreements: 3, expiring_soon: 1,
      expired: 1, pending: 1, covered_clusters: 5, uncovered_clusters: 1,
      active_alerts: 2, evaluated_at: new Date().toISOString(),
    })
  }),

  // ── Segregation of Duties mock handlers (demo mode) ──────────────────
  http.get('/api/compliance/sod/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_rules: 8, total_principals: 12, total_violations: 2,
      by_severity: { high: 1, medium: 1 },
      by_conflict_type: { deployment: 1, access: 1 },
      compliance_score: 83, clean_principals: 10, conflicted_principals: 2,
    })
  }),

  http.get('/api/compliance/sod/rules', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'sod-1', name: 'Deployment ≠ Approval', description: 'Users who deploy cannot approve their own deployments', role_a: 'deployer', role_b: 'approver', conflict_type: 'deployment', severity: 'high', regulation: 'SOX §404' },
      { id: 'sod-2', name: 'Admin ≠ Auditor', description: 'Cluster admins cannot hold auditor role', role_a: 'cluster-admin', role_b: 'auditor', conflict_type: 'access', severity: 'critical', regulation: 'PCI-DSS 7.1' },
      { id: 'sod-3', name: 'Secret Access ≠ Deployment', description: 'Users with secret access cannot deploy workloads', role_a: 'secret-reader', role_b: 'deployer', conflict_type: 'access', severity: 'high', regulation: 'SOC2 CC6.1' },
      { id: 'sod-4', name: 'Network Policy ≠ Workload Owner', description: 'Network policy editors cannot own workloads in same namespace', role_a: 'network-admin', role_b: 'workload-owner', conflict_type: 'access', severity: 'medium', regulation: 'NIST AC-5' },
      { id: 'sod-5', name: 'RBAC Admin ≠ Developer', description: 'RBAC administrators cannot hold developer roles', role_a: 'rbac-admin', role_b: 'developer', conflict_type: 'access', severity: 'high', regulation: 'SOX §404' },
      { id: 'sod-6', name: 'Release Manager ≠ QA', description: 'Release managers cannot perform QA sign-off', role_a: 'release-manager', role_b: 'qa-signer', conflict_type: 'deployment', severity: 'medium', regulation: 'ISO 27001 A.6.1.2' },
      { id: 'sod-7', name: 'Backup Admin ≠ Restore', description: 'Backup administrators cannot perform restores', role_a: 'backup-admin', role_b: 'restore-operator', conflict_type: 'access', severity: 'medium', regulation: 'SOC2 CC6.3' },
      { id: 'sod-8', name: 'Monitoring ≠ Alert Suppression', description: 'Monitoring editors cannot suppress alerts', role_a: 'monitoring-editor', role_b: 'alert-manager', conflict_type: 'access', severity: 'medium', regulation: 'PCI-DSS 10.6' },
    ])
  }),

  http.get('/api/compliance/sod/principals', async () => {
    await delay(150)
    return HttpResponse.json([
      { name: 'alice@example.com', type: 'user', roles: ['deployer', 'developer'], clusters: ['prod-east', 'staging'] },
      { name: 'bob@example.com', type: 'user', roles: ['approver', 'auditor'], clusters: ['prod-east', 'prod-west'] },
      { name: 'carol@example.com', type: 'user', roles: ['cluster-admin'], clusters: ['staging'] },
      { name: 'ci-bot', type: 'serviceaccount', roles: ['deployer'], clusters: ['prod-east', 'prod-west', 'staging'] },
      { name: 'dave@example.com', type: 'user', roles: ['developer', 'qa-signer'], clusters: ['staging'] },
      { name: 'eve@example.com', type: 'user', roles: ['network-admin'], clusters: ['prod-east'] },
    ])
  }),

  http.get('/api/compliance/sod/violations', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'sv-1', rule_id: 'sod-1', principal: 'frank@example.com', principal_type: 'user', role_a: 'deployer', role_b: 'approver', clusters: ['prod-east'], severity: 'high', description: 'User frank@ holds both deployer and approver roles in prod-east' },
      { id: 'sv-2', rule_id: 'sod-4', principal: 'staging-netops', principal_type: 'serviceaccount', role_a: 'network-admin', role_b: 'workload-owner', clusters: ['staging'], severity: 'medium', description: 'Service account staging-netops manages network policies and owns workloads' },
    ])
  }),

  // ── Change Control mock handlers (demo mode) ───────────────────────
  http.get('/api/compliance/change-control/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_changes: 47, approved_changes: 32, unapproved_changes: 3,
      emergency_changes: 1, policy_violations: 1, risk_score: 24,
      by_cluster: { 'prod-east': 22, 'prod-west': 14, staging: 11 },
      by_type: { create: 12, update: 28, delete: 7 },
      by_actor: { 'alice@example.com': 15, 'bob@example.com': 12, 'carol@example.com': 10, 'ci-bot': 10 },
    })
  }),

  http.get('/api/compliance/change-control/changes', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'cc-001', timestamp: '2026-04-21T08:30:00Z', cluster: 'prod-east', namespace: 'ingress-system', resource_kind: 'Deployment', resource_name: 'ingress-nginx', change_type: 'update', actor: 'alice@example.com', approval_status: 'approved', approved_by: 'bob@example.com', ticket_ref: 'CHG-2041', description: 'Upgrade ingress-nginx to v1.10.0 — security patch for CVE-2026-1188', diff_summary: '+12 -8 lines', risk_score: 35 },
      { id: 'cc-002', timestamp: '2026-04-20T14:15:00Z', cluster: 'prod-east', namespace: 'payment', resource_kind: 'NetworkPolicy', resource_name: 'payment-egress', change_type: 'create', actor: 'carol@example.com', approval_status: 'approved', approved_by: 'dave@example.com', ticket_ref: 'CHG-2038', description: 'Add NetworkPolicy restricting egress from payment namespace', diff_summary: '+45 lines', risk_score: 18 },
      { id: 'cc-003', timestamp: '2026-04-22T11:00:00Z', cluster: 'prod-west', namespace: 'checkout', resource_kind: 'Deployment', resource_name: 'checkout-api', change_type: 'update', actor: 'eve@example.com', approval_status: 'pending', description: 'Scale API deployment to 5 replicas for traffic spike', diff_summary: 'replicas: 3→5', risk_score: 12 },
      { id: 'cc-004', timestamp: '2026-04-21T02:45:00Z', cluster: 'prod-east', namespace: 'kube-system', resource_kind: 'DaemonSet', resource_name: 'kube-proxy', change_type: 'update', actor: 'alice@example.com', approval_status: 'emergency', approved_by: 'bob@example.com', ticket_ref: 'EMG-0091', description: 'Emergency: Patch CVE-2026-1234 in kube-proxy', diff_summary: '+3 -3 lines', risk_score: 72 },
      { id: 'cc-005', timestamp: '2026-04-22T14:00:00Z', cluster: 'staging', namespace: 'checkout', resource_kind: 'HorizontalPodAutoscaler', resource_name: 'checkout-hpa', change_type: 'update', actor: 'dave@example.com', approval_status: 'pending', description: 'Update HPA thresholds — CPU 70→60%, memory 80→75%', diff_summary: '+2 -2 lines', risk_score: 8 },
      { id: 'cc-006', timestamp: '2026-04-18T09:30:00Z', cluster: 'prod-west', namespace: 'istio-system', resource_kind: 'Secret', resource_name: 'mesh-tls-cert', change_type: 'update', actor: 'carol@example.com', approval_status: 'rejected', approved_by: 'bob@example.com', ticket_ref: 'CHG-2035', description: 'Rotate TLS certificates for service mesh — rejected: wrong cert chain', diff_summary: '+1 -1 lines', risk_score: 55 },
    ])
  }),

  http.get('/api/compliance/change-control/violations', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'cv-001', change_id: 'cc-untracked-01', policy: 'require-approval-production', severity: 'high', description: 'ConfigMap "checkout-config" updated in production without a change request or approval', detected_at: '2026-04-19T03:22:00Z', acknowledged: false },
    ])
  }),

  http.get('/api/compliance/change-control/policies', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'cp-1', name: 'Require Approval for Production', description: 'All production changes must be approved by a reviewer before implementation', scope: 'production', requires_approval: true, requires_ticket: true, severity: 'high' },
      { id: 'cp-2', name: 'Change Freeze Window', description: 'No standard changes during maintenance windows (Sat 02:00-06:00 UTC)', scope: 'all', requires_approval: false, requires_ticket: false, severity: 'medium' },
      { id: 'cp-3', name: 'Emergency Change Audit', description: 'Emergency changes must have post-implementation review within 48 hours', scope: 'all', requires_approval: true, requires_ticket: true, severity: 'high' },
    ])
  }),

  // ── Data Residency mock handlers (demo mode) ──────────────────────
  http.get('/api/compliance/residency/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_rules: 4, total_clusters: 6, total_violations: 1,
      by_severity: { medium: 1 },
      by_region: { 'us-east-1': 2, 'us-west-2': 1, 'eu-central-1': 1, 'eu-west-1': 1, 'ap-south-1': 1 },
      compliant: 5, non_compliant: 1,
    })
  }),

  http.get('/api/compliance/residency/clusters', async () => {
    await delay(150)
    return HttpResponse.json([
      { cluster: 'prod-east', region: 'us', jurisdiction: 'United States' },
      { cluster: 'prod-west', region: 'us', jurisdiction: 'United States' },
      { cluster: 'eu-central', region: 'eu', jurisdiction: 'Germany (EU)' },
      { cluster: 'eu-west', region: 'eu', jurisdiction: 'Ireland (EU)' },
      { cluster: 'ap-south', region: 'apac', jurisdiction: 'India (APAC)' },
      { cluster: 'staging', region: 'us', jurisdiction: 'United States' },
    ])
  }),

  http.get('/api/compliance/residency/rules', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'dr-1', classification: 'GDPR', allowed_regions: ['eu'], description: 'GDPR-classified data must reside in EU regions only', enforcement: 'deny' },
      { id: 'dr-2', classification: 'PHI', allowed_regions: ['us'], description: 'PHI data must remain in US regions per HIPAA', enforcement: 'deny' },
      { id: 'dr-3', classification: 'PII', allowed_regions: ['us', 'eu', 'ca'], description: 'PII data allowed in US, EU, and Canada — encrypted at rest', enforcement: 'warn' },
      { id: 'dr-4', classification: 'test', allowed_regions: ['us'], description: 'Test-classified data must not exist in production clusters', enforcement: 'audit' },
    ])
  }),

  http.get('/api/compliance/residency/violations', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'dv-1', cluster: 'staging', cluster_region: 'us', namespace: 'qa-data', workload_name: 'data-generator', workload_kind: 'CronJob', classification: 'test', allowed_regions: ['us'], severity: 'medium', detected_at: '2026-04-22T08:00:00Z', message: 'Test data found in staging cluster co-located with production workloads' },
    ])
  }),

]
}
