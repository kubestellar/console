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

export function createComplianceHandlers() {
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

  // ── Identity & Access mock handlers (demo mode) ──────────────────
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

  // ── SIEM mock handlers ──────────────────────────────────────────────

  http.get('/api/v1/compliance/siem/events', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'evt-001', timestamp: new Date(Date.now() - DEMO_1_MIN_MS).toISOString(), source: 'falco', severity: 'critical', category: 'runtime', message: 'Unexpected process spawned in container nginx-proxy', cluster: 'prod-east-1' },
      { id: 'evt-002', timestamp: new Date(Date.now() - DEMO_2_MIN_MS).toISOString(), source: 'auditd', severity: 'high', category: 'access', message: 'Unauthorized kubectl exec attempt on kube-system namespace', cluster: 'prod-east-1' },
      { id: 'evt-003', timestamp: new Date(Date.now() - DEMO_3_MIN_MS).toISOString(), source: 'kube-apiserver', severity: 'medium', category: 'auth', message: 'ServiceAccount token used from unexpected IP range', cluster: 'prod-west-2' },
      { id: 'evt-004', timestamp: new Date(Date.now() - DEMO_4_MIN_MS).toISOString(), source: 'calico', severity: 'high', category: 'network', message: 'Network policy violation: egress to blocked CIDR detected', cluster: 'staging-1' },
      { id: 'evt-005', timestamp: new Date(Date.now() - DEMO_5_MIN_MS).toISOString(), source: 'trivy', severity: 'medium', category: 'vulnerability', message: 'Critical CVE detected in running container image', cluster: 'prod-east-1' },
      { id: 'evt-006', timestamp: new Date(Date.now() - DEMO_6_MIN_MS).toISOString(), source: 'falco', severity: 'low', category: 'runtime', message: 'Read of sensitive file /etc/shadow in container', cluster: 'dev-1' },
      { id: 'evt-007', timestamp: new Date(Date.now() - DEMO_7_MIN_MS).toISOString(), source: 'opa', severity: 'info', category: 'policy', message: 'Pod admission policy evaluated: 3 constraints checked', cluster: 'prod-west-2' },
      { id: 'evt-008', timestamp: new Date(Date.now() - DEMO_8_MIN_MS).toISOString(), source: 'kube-apiserver', severity: 'high', category: 'auth', message: 'Failed OIDC token validation from external identity provider', cluster: 'prod-east-1' },
    ])
  }),

  http.get('/api/v1/compliance/siem/alerts', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'alrt-001', name: 'Suspicious Process Execution', severity: 'critical', status: 'active', source: 'falco', triggered_at: new Date(Date.now() - DEMO_30_SEC_MS).toISOString(), correlated_events: 5 },
      { id: 'alrt-002', name: 'Unauthorized API Access', severity: 'high', status: 'active', source: 'kube-apiserver', triggered_at: new Date(Date.now() - DEMO_90_SEC_MS).toISOString(), correlated_events: 3 },
      { id: 'alrt-003', name: 'Network Policy Violation', severity: 'high', status: 'acknowledged', source: 'calico', triggered_at: new Date(Date.now() - DEMO_150_SEC_MS).toISOString(), correlated_events: 8 },
      { id: 'alrt-004', name: 'Image Vulnerability Detected', severity: 'medium', status: 'active', source: 'trivy', triggered_at: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), correlated_events: 2 },
      { id: 'alrt-005', name: 'Privilege Escalation Attempt', severity: 'critical', status: 'resolved', source: 'falco', triggered_at: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), correlated_events: 12 },
      { id: 'alrt-006', name: 'OIDC Token Validation Failure', severity: 'medium', status: 'active', source: 'kube-apiserver', triggered_at: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), correlated_events: 4 },
    ])
  }),

  http.get('/api/v1/compliance/siem/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_events: 14832,
      events_last_24h: 2847,
      total_alerts: 23,
      active_alerts: 8,
      critical_alerts: 3,
      high_alerts: 7,
      medium_alerts: 9,
      low_alerts: 4,
      top_sources: [
        { source: 'falco', count: 1243 },
        { source: 'kube-apiserver', count: 876 },
        { source: 'calico', count: 412 },
        { source: 'trivy', count: 198 },
        { source: 'opa', count: 118 },
      ],
      ingestion_rate: 42,
    })
  }),

  // ── Incident Response mock handlers ─────────────────────────────────

  http.get('/api/v1/compliance/incidents', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'INC-001', title: 'Unauthorized container escape in prod-east-1', severity: 'critical', status: 'investigating', assignee: 'alice@acme.com', created_at: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), updated_at: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), escalation_level: 2, cluster: 'prod-east-1', playbook_id: 'pb-container-escape' },
      { id: 'INC-002', title: 'Mass pod eviction in staging cluster', severity: 'high', status: 'mitigating', assignee: 'bob@acme.com', created_at: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), updated_at: new Date(Date.now() - DEMO_15_MIN_MS).toISOString(), escalation_level: 1, cluster: 'staging-1', playbook_id: 'pb-pod-eviction' },
      { id: 'INC-003', title: 'Leaked service account token detected', severity: 'critical', status: 'open', assignee: 'charlie@acme.com', created_at: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), updated_at: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), escalation_level: 3, cluster: 'prod-west-2', playbook_id: null },
      { id: 'INC-004', title: 'TLS certificate expiry in 48h', severity: 'medium', status: 'investigating', assignee: 'dana@acme.com', created_at: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), updated_at: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), escalation_level: 1, cluster: 'prod-east-1', playbook_id: 'pb-cert-renewal' },
      { id: 'INC-005', title: 'DNS resolution failures in dev cluster', severity: 'low', status: 'resolved', assignee: 'eve@acme.com', created_at: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), updated_at: new Date(Date.now() - DEMO_12_HOUR_MS).toISOString(), escalation_level: 0, cluster: 'dev-1', playbook_id: null },
    ])
  }),

  http.get('/api/v1/compliance/incidents/metrics', async () => {
    await delay(100)
    return HttpResponse.json({
      total_incidents: 47,
      active_incidents: 4,
      resolved_last_30d: 18,
      mttr_hours: 4.2,
      mttr_trend: 'improving',
      escalation_rate: 23,
      by_severity: { critical: 8, high: 14, medium: 17, low: 8 },
      by_status: { open: 2, investigating: 5, mitigating: 3, resolved: 18, closed: 19 },
    })
  }),

  http.get('/api/v1/compliance/incidents/playbooks', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'pb-container-escape', name: 'Container Escape Response', description: 'Isolate compromised pod, capture forensic data, rotate secrets', last_executed: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), execution_count: 7, avg_resolution_min: 45, status: 'active', steps: 12 },
      { id: 'pb-pod-eviction', name: 'Mass Pod Eviction', description: 'Investigate node pressure, redistribute workloads, scale cluster', last_executed: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), execution_count: 14, avg_resolution_min: 30, status: 'active', steps: 8 },
      { id: 'pb-cert-renewal', name: 'Certificate Renewal', description: 'Renew TLS certificates, update secrets, rolling restart services', last_executed: new Date(Date.now() - DEMO_2_DAY_MS).toISOString(), execution_count: 22, avg_resolution_min: 15, status: 'active', steps: 6 },
      { id: 'pb-secret-rotation', name: 'Secret Rotation', description: 'Rotate compromised secrets across all dependent services', last_executed: new Date(Date.now() - DEMO_1_WEEK_MS).toISOString(), execution_count: 5, avg_resolution_min: 60, status: 'active', steps: 15 },
      { id: 'pb-ddos-response', name: 'DDoS Response', description: 'Enable rate limiting, scale ingress, activate WAF rules', last_executed: new Date(Date.now() - DEMO_30_DAY_MS).toISOString(), execution_count: 2, avg_resolution_min: 90, status: 'draft', steps: 10 },
    ])
  }),

  // ── Threat Intelligence mock handlers ───────────────────────────────

  http.get('/api/v1/compliance/threat-intel/feeds', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'feed-001', name: 'MITRE ATT&CK', provider: 'MITRE Corporation', status: 'active', last_updated: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), indicators_count: 14500, category: 'TTPs' },
      { id: 'feed-002', name: 'AlienVault OTX', provider: 'AT&T Cybersecurity', status: 'active', last_updated: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), indicators_count: 89200, category: 'IOCs' },
      { id: 'feed-003', name: 'Abuse.ch URLhaus', provider: 'abuse.ch', status: 'active', last_updated: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), indicators_count: 42100, category: 'Malware' },
      { id: 'feed-004', name: 'CISA KEV', provider: 'CISA', status: 'active', last_updated: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), indicators_count: 1120, category: 'Vulnerabilities' },
      { id: 'feed-005', name: 'Custom Internal Feed', provider: 'Internal SOC', status: 'stale', last_updated: new Date(Date.now() - DEMO_1_WEEK_MS).toISOString(), indicators_count: 340, category: 'Internal' },
      { id: 'feed-006', name: 'PhishTank', provider: 'OpenDNS', status: 'active', last_updated: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), indicators_count: 28700, category: 'Phishing' },
    ])
  }),

  http.get('/api/v1/compliance/threat-intel/iocs', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'ioc-001', ioc_type: 'ip', indicator: '198.51.100.42', feed_name: 'AlienVault OTX', severity: 'critical', matched_resource: 'pod/api-gateway', cluster: 'prod-east-1', detected_at: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), status: 'active' },
      { id: 'ioc-002', ioc_type: 'domain', indicator: 'malware-c2.example.net', feed_name: 'Abuse.ch URLhaus', severity: 'critical', matched_resource: 'pod/worker-processor', cluster: 'prod-east-1', detected_at: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), status: 'active' },
      { id: 'ioc-003', ioc_type: 'hash', indicator: 'a1b2c3d4e5f6...', feed_name: 'AlienVault OTX', severity: 'high', matched_resource: 'image/nginx:1.24', cluster: 'prod-west-2', detected_at: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), status: 'mitigated' },
      { id: 'ioc-004', ioc_type: 'ip', indicator: '203.0.113.99', feed_name: 'CISA KEV', severity: 'high', matched_resource: 'service/ingress-nginx', cluster: 'staging-1', detected_at: new Date(Date.now() - DEMO_8_HOUR_MS).toISOString(), status: 'active' },
      { id: 'ioc-005', ioc_type: 'url', indicator: 'http://phish.example.com/login', feed_name: 'PhishTank', severity: 'medium', matched_resource: 'pod/web-frontend', cluster: 'prod-east-1', detected_at: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), status: 'false_positive' },
      { id: 'ioc-006', ioc_type: 'domain', indicator: 'crypto-miner.example.org', feed_name: 'Abuse.ch URLhaus', severity: 'high', matched_resource: 'pod/batch-worker', cluster: 'dev-1', detected_at: new Date(Date.now() - DEMO_2_DAY_MS).toISOString(), status: 'mitigated' },
    ])
  }),

  http.get('/api/v1/compliance/threat-intel/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_feeds: 6,
      active_feeds: 5,
      total_indicators: 175960,
      total_matches: 23,
      active_matches: 8,
      risk_score: 42,
      critical_matches: 3,
      high_matches: 7,
      medium_matches: 9,
      low_matches: 4,
      top_ioc_types: [
        { type: 'ip', count: 9 },
        { type: 'domain', count: 6 },
        { type: 'hash', count: 4 },
        { type: 'url', count: 3 },
        { type: 'email', count: 1 },
      ],
      vulnerability_correlation: 73,
    })
  }),

  // Card templates
  // ── Epic 6: Supply Chain Security ─────────────────────────────────────

  // SBOM endpoints
  http.get('/api/v1/compliance/sbom/packages', async () => {
    await delay(100)
    return HttpResponse.json([
      { name: '@kubernetes/client-node', version: '0.20.0', license: 'Apache-2.0', ecosystem: 'npm', vulnerabilities: 0, risk: 'none' },
      { name: 'express', version: '4.18.2', license: 'MIT', ecosystem: 'npm', vulnerabilities: 1, risk: 'medium' },
      { name: 'lodash', version: '4.17.21', license: 'MIT', ecosystem: 'npm', vulnerabilities: 0, risk: 'none' },
      { name: 'axios', version: '1.6.2', license: 'MIT', ecosystem: 'npm', vulnerabilities: 2, risk: 'high' },
      { name: 'golang.org/x/net', version: '0.19.0', license: 'BSD-3-Clause', ecosystem: 'go', vulnerabilities: 1, risk: 'critical' },
      { name: 'github.com/gin-gonic/gin', version: '1.9.1', license: 'MIT', ecosystem: 'go', vulnerabilities: 0, risk: 'none' },
      { name: 'flask', version: '3.0.0', license: 'BSD-3-Clause', ecosystem: 'pip', vulnerabilities: 0, risk: 'none' },
      { name: 'requests', version: '2.31.0', license: 'Apache-2.0', ecosystem: 'pip', vulnerabilities: 1, risk: 'low' },
      { name: 'containerd', version: '1.7.11', license: 'Apache-2.0', ecosystem: 'go', vulnerabilities: 3, risk: 'critical' },
      { name: 'openssl', version: '3.1.4', license: 'Apache-2.0', ecosystem: 'system', vulnerabilities: 1, risk: 'high' },
    ])
  }),

  http.get('/api/v1/compliance/sbom/vulnerabilities', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'vuln-1', package_name: 'golang.org/x/net', severity: 'critical', cve: 'CVE-2023-44487', fixed_version: '0.20.0', status: 'open' },
      { id: 'vuln-2', package_name: 'containerd', severity: 'critical', cve: 'CVE-2023-47108', fixed_version: '1.7.12', status: 'open' },
      { id: 'vuln-3', package_name: 'containerd', severity: 'high', cve: 'CVE-2023-45142', fixed_version: '1.7.12', status: 'patched' },
      { id: 'vuln-4', package_name: 'axios', severity: 'high', cve: 'CVE-2023-45857', fixed_version: '1.6.3', status: 'open' },
      { id: 'vuln-5', package_name: 'axios', severity: 'medium', cve: 'CVE-2023-26159', fixed_version: '1.6.4', status: 'ignored' },
      { id: 'vuln-6', package_name: 'express', severity: 'medium', cve: 'CVE-2024-29041', fixed_version: '4.19.0', status: 'open' },
      { id: 'vuln-7', package_name: 'openssl', severity: 'high', cve: 'CVE-2023-5678', fixed_version: '3.1.5', status: 'patched' },
      { id: 'vuln-8', package_name: 'containerd', severity: 'medium', cve: 'CVE-2023-47106', fixed_version: '1.7.12', status: 'open' },
      { id: 'vuln-9', package_name: 'requests', severity: 'low', cve: 'CVE-2023-32681', fixed_version: '2.31.1', status: 'patched' },
    ])
  }),

  http.get('/api/v1/compliance/sbom/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_packages: 342,
      total_vulnerabilities: 9,
      critical_vulns: 2,
      high_vulns: 3,
      medium_vulns: 3,
      low_vulns: 1,
      license_compliant: 298,
      license_non_compliant: 12,
      license_unknown: 32,
      ecosystems: [
        { name: 'npm', count: 156 },
        { name: 'go', count: 98 },
        { name: 'pip', count: 64 },
        { name: 'system', count: 24 },
      ],
      scan_status: 'completed',
      last_scan: '2025-01-15T10:30:00Z',
    })
  }),

  // Sigstore endpoints
  http.get('/api/v1/compliance/sigstore/signatures', async () => {
    await delay(100)
    return HttpResponse.json([
      { image: 'ghcr.io/kubestellar/console:v0.28.0', digest: 'sha256:a1b2c3d4', signed: true, signer: 'release-bot@kubestellar.io', issuer: 'https://accounts.google.com', timestamp: '2025-01-15T08:00:00Z', transparency_log: true, status: 'verified' },
      { image: 'ghcr.io/kubestellar/kc-agent:v0.12.0', digest: 'sha256:e5f6a7b8', signed: true, signer: 'ci@kubestellar.io', issuer: 'https://token.actions.githubusercontent.com', timestamp: '2025-01-14T16:30:00Z', transparency_log: true, status: 'verified' },
      { image: 'ghcr.io/kubestellar/controller:v0.9.1', digest: 'sha256:c9d0e1f2', signed: true, signer: 'ci@kubestellar.io', issuer: 'https://token.actions.githubusercontent.com', timestamp: '2025-01-13T12:15:00Z', transparency_log: true, status: 'verified' },
      { image: 'docker.io/library/nginx:1.25', digest: 'sha256:f3a4b5c6', signed: true, signer: 'docker-official@docker.com', issuer: 'https://accounts.google.com', timestamp: '2025-01-12T09:00:00Z', transparency_log: false, status: 'verified' },
      { image: 'quay.io/custom/worker:dev', digest: 'sha256:d7e8f9a0', signed: false, signer: '', issuer: '', timestamp: '', transparency_log: false, status: 'failed' },
      { image: 'ghcr.io/kubestellar/proxy:v0.5.0', digest: 'sha256:b1c2d3e4', signed: true, signer: 'release-bot@kubestellar.io', issuer: 'https://accounts.google.com', timestamp: '2025-01-11T14:20:00Z', transparency_log: true, status: 'verified' },
      { image: 'registry.internal/ml-serve:latest', digest: 'sha256:a5b6c7d8', signed: false, signer: '', issuer: '', timestamp: '', transparency_log: false, status: 'pending' },
    ])
  }),

  http.get('/api/v1/compliance/sigstore/verifications', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'ver-1', image: 'ghcr.io/kubestellar/console:v0.28.0', policy: 'require-keyless-signing', result: 'pass', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 3, rekor_entry: true },
      { id: 'ver-2', image: 'ghcr.io/kubestellar/kc-agent:v0.12.0', policy: 'require-keyless-signing', result: 'pass', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 3, rekor_entry: true },
      { id: 'ver-3', image: 'ghcr.io/kubestellar/controller:v0.9.1', policy: 'require-keyless-signing', result: 'pass', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 3, rekor_entry: true },
      { id: 'ver-4', image: 'quay.io/custom/worker:dev', policy: 'require-keyless-signing', result: 'fail', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 0, rekor_entry: false },
      { id: 'ver-5', image: 'docker.io/library/nginx:1.25', policy: 'allow-docker-official', result: 'pass', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 2, rekor_entry: false },
      { id: 'ver-6', image: 'registry.internal/ml-serve:latest', policy: 'require-keyless-signing', result: 'warn', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 0, rekor_entry: false },
    ])
  }),

  http.get('/api/v1/compliance/sigstore/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_images: 42,
      signed_images: 38,
      unsigned_images: 4,
      verified_signatures: 36,
      failed_verifications: 2,
      pending_verifications: 4,
      transparency_log_entries: 34,
      trust_roots: 3,
      policies_enforced: 5,
      last_verification: '2025-01-15T10:00:00Z',
    })
  }),

  // SLSA endpoints
  http.get('/api/v1/compliance/slsa/attestations', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'att-1', artifact: 'ghcr.io/kubestellar/console:v0.28.0', builder: 'GitHub Actions', slsa_level: 3, verified: true, build_type: 'https://slsa.dev/container-based-build/v0.1', source_repo: 'github.com/kubestellar/console', timestamp: '2025-01-15T08:00:00Z', status: 'pass' },
      { id: 'att-2', artifact: 'ghcr.io/kubestellar/kc-agent:v0.12.0', builder: 'GitHub Actions', slsa_level: 3, verified: true, build_type: 'https://slsa.dev/container-based-build/v0.1', source_repo: 'github.com/kubestellar/kc-agent', timestamp: '2025-01-14T16:30:00Z', status: 'pass' },
      { id: 'att-3', artifact: 'ghcr.io/kubestellar/controller:v0.9.1', builder: 'GitHub Actions', slsa_level: 2, verified: true, build_type: 'https://github.com/slsa-framework/slsa-github-generator', source_repo: 'github.com/kubestellar/kubestellar', timestamp: '2025-01-13T12:15:00Z', status: 'pass' },
      { id: 'att-4', artifact: 'quay.io/custom/worker:dev', builder: 'Local Build', slsa_level: 1, verified: false, build_type: 'docker build', source_repo: 'github.com/internal/worker', timestamp: '2025-01-12T09:00:00Z', status: 'fail' },
      { id: 'att-5', artifact: 'ghcr.io/kubestellar/proxy:v0.5.0', builder: 'Tekton Chains', slsa_level: 4, verified: true, build_type: 'https://tekton.dev/chains/v1', source_repo: 'github.com/kubestellar/proxy', timestamp: '2025-01-11T14:20:00Z', status: 'pass' },
      { id: 'att-6', artifact: 'registry.internal/ml-serve:latest', builder: 'Jenkins', slsa_level: 1, verified: false, build_type: 'jenkins-pipeline', source_repo: 'gitlab.internal/ml/serve', timestamp: '2025-01-10T11:00:00Z', status: 'pending' },
      { id: 'att-7', artifact: 'ghcr.io/kubestellar/docs:v2.1.0', builder: 'GitHub Actions', slsa_level: 3, verified: true, build_type: 'https://slsa.dev/container-based-build/v0.1', source_repo: 'github.com/kubestellar/docs', timestamp: '2025-01-09T08:45:00Z', status: 'pass' },
    ])
  }),

  http.get('/api/v1/compliance/slsa/provenance', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'prov-1', artifact: 'ghcr.io/kubestellar/console:v0.28.0', builder_id: 'https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml', build_level: 3, source_uri: 'git+https://github.com/kubestellar/console@refs/tags/v0.28.0', source_digest: 'sha1:abc1234', reproducible: true, hermetic: true, parameterless: true, timestamp: '2025-01-15T08:00:00Z' },
      { id: 'prov-2', artifact: 'ghcr.io/kubestellar/kc-agent:v0.12.0', builder_id: 'https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml', build_level: 3, source_uri: 'git+https://github.com/kubestellar/kc-agent@refs/tags/v0.12.0', source_digest: 'sha1:def5678', reproducible: true, hermetic: true, parameterless: false, timestamp: '2025-01-14T16:30:00Z' },
      { id: 'prov-3', artifact: 'ghcr.io/kubestellar/controller:v0.9.1', builder_id: 'https://github.com/slsa-framework/slsa-github-generator', build_level: 2, source_uri: 'git+https://github.com/kubestellar/kubestellar@refs/tags/v0.9.1', source_digest: 'sha1:ghi9012', reproducible: false, hermetic: true, parameterless: true, timestamp: '2025-01-13T12:15:00Z' },
      { id: 'prov-4', artifact: 'quay.io/custom/worker:dev', builder_id: 'local-docker', build_level: 1, source_uri: 'git+https://github.com/internal/worker@refs/heads/main', source_digest: 'sha1:jkl3456', reproducible: false, hermetic: false, parameterless: false, timestamp: '2025-01-12T09:00:00Z' },
      { id: 'prov-5', artifact: 'ghcr.io/kubestellar/proxy:v0.5.0', builder_id: 'https://tekton.dev/chains/v1', build_level: 4, source_uri: 'git+https://github.com/kubestellar/proxy@refs/tags/v0.5.0', source_digest: 'sha1:mno7890', reproducible: true, hermetic: true, parameterless: true, timestamp: '2025-01-11T14:20:00Z' },
    ])
  }),

  http.get('/api/v1/compliance/slsa/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_artifacts: 42,
      attested_artifacts: 38,
      level_1: 6,
      level_2: 8,
      level_3: 22,
      level_4: 6,
      verified_attestations: 35,
      failed_attestations: 2,
      pending_attestations: 5,
      source_integrity_pass: 37,
      source_integrity_fail: 5,
      reproducible_builds: 30,
      total_builds: 42,
    })
  }),

  // ── Epic 7: Enterprise Risk Management ─────────────────────────────────

  // Risk Matrix endpoints
  http.get('/api/v1/compliance/erm/risk-matrix/risks', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'RSK-001', name: 'Cloud provider outage', category: 'Technology', likelihood: 3, impact: 5, score: 15, owner: 'CTO', status: 'Open', last_review: '2025-01-10T00:00:00Z' },
      { id: 'RSK-002', name: 'Data breach via supply chain', category: 'Technology', likelihood: 4, impact: 5, score: 20, owner: 'CISO', status: 'Mitigating', last_review: '2025-01-08T00:00:00Z' },
      { id: 'RSK-003', name: 'Regulatory non-compliance fine', category: 'Compliance', likelihood: 2, impact: 5, score: 10, owner: 'CCO', status: 'Open', last_review: '2025-01-05T00:00:00Z' },
      { id: 'RSK-004', name: 'Key personnel departure', category: 'Operational', likelihood: 3, impact: 4, score: 12, owner: 'CHRO', status: 'Accepted', last_review: '2025-01-12T00:00:00Z' },
      { id: 'RSK-005', name: 'Market share erosion', category: 'Strategic', likelihood: 3, impact: 3, score: 9, owner: 'CSO', status: 'Open', last_review: '2025-01-06T00:00:00Z' },
      { id: 'RSK-006', name: 'Currency exchange volatility', category: 'Financial', likelihood: 4, impact: 3, score: 12, owner: 'CFO', status: 'Mitigating', last_review: '2025-01-11T00:00:00Z' },
      { id: 'RSK-007', name: 'Negative media coverage', category: 'Reputational', likelihood: 2, impact: 4, score: 8, owner: 'CMO', status: 'Open', last_review: '2025-01-09T00:00:00Z' },
      { id: 'RSK-008', name: 'Kubernetes cluster compromise', category: 'Technology', likelihood: 3, impact: 5, score: 15, owner: 'CISO', status: 'Mitigating', last_review: '2025-01-13T00:00:00Z' },
      { id: 'RSK-009', name: 'Third-party vendor bankruptcy', category: 'Operational', likelihood: 2, impact: 3, score: 6, owner: 'CPO', status: 'Accepted', last_review: '2025-01-07T00:00:00Z' },
      { id: 'RSK-010', name: 'Insider threat data exfiltration', category: 'Technology', likelihood: 2, impact: 5, score: 10, owner: 'CISO', status: 'Open', last_review: '2025-01-14T00:00:00Z' },
      { id: 'RSK-011', name: 'Pandemic business disruption', category: 'Operational', likelihood: 1, impact: 5, score: 5, owner: 'COO', status: 'Closed', last_review: '2024-12-20T00:00:00Z' },
      { id: 'RSK-012', name: 'Interest rate increase', category: 'Financial', likelihood: 4, impact: 2, score: 8, owner: 'CFO', status: 'Accepted', last_review: '2025-01-04T00:00:00Z' },
      { id: 'RSK-013', name: 'Supply chain disruption', category: 'Operational', likelihood: 3, impact: 4, score: 12, owner: 'COO', status: 'Mitigating', last_review: '2025-01-10T00:00:00Z' },
      { id: 'RSK-014', name: 'Patent infringement claim', category: 'Strategic', likelihood: 2, impact: 4, score: 8, owner: 'CLO', status: 'Open', last_review: '2025-01-03T00:00:00Z' },
      { id: 'RSK-015', name: 'Failed product launch', category: 'Strategic', likelihood: 3, impact: 3, score: 9, owner: 'CPO', status: 'Open', last_review: '2025-01-02T00:00:00Z' },
      { id: 'RSK-016', name: 'GDPR violation', category: 'Compliance', likelihood: 2, impact: 5, score: 10, owner: 'DPO', status: 'Mitigating', last_review: '2025-01-11T00:00:00Z' },
      { id: 'RSK-017', name: 'Critical CVE in base images', category: 'Technology', likelihood: 4, impact: 4, score: 16, owner: 'CISO', status: 'Mitigating', last_review: '2025-01-14T00:00:00Z' },
      { id: 'RSK-018', name: 'Customer data loss', category: 'Reputational', likelihood: 1, impact: 5, score: 5, owner: 'CISO', status: 'Mitigating', last_review: '2025-01-12T00:00:00Z' },
    ])
  }),

  http.get('/api/v1/compliance/erm/risk-matrix/heatmap', async () => {
    await delay(100)
    return HttpResponse.json([
      { likelihood: 4, impact: 5, count: 1, risks: ['RSK-002'] },
      { likelihood: 4, impact: 4, count: 1, risks: ['RSK-017'] },
      { likelihood: 4, impact: 3, count: 1, risks: ['RSK-006'] },
      { likelihood: 4, impact: 2, count: 1, risks: ['RSK-012'] },
      { likelihood: 3, impact: 5, count: 2, risks: ['RSK-001', 'RSK-008'] },
      { likelihood: 3, impact: 4, count: 2, risks: ['RSK-004', 'RSK-013'] },
      { likelihood: 3, impact: 3, count: 2, risks: ['RSK-005', 'RSK-015'] },
      { likelihood: 2, impact: 5, count: 3, risks: ['RSK-003', 'RSK-010', 'RSK-016'] },
      { likelihood: 2, impact: 4, count: 2, risks: ['RSK-007', 'RSK-014'] },
      { likelihood: 2, impact: 3, count: 1, risks: ['RSK-009'] },
      { likelihood: 1, impact: 5, count: 2, risks: ['RSK-011', 'RSK-018'] },
    ])
  }),

  http.get('/api/v1/compliance/erm/risk-matrix/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_risks: 18,
      critical: 2,
      high: 3,
      medium: 7,
      low: 6,
      trend_direction: 'down',
      trend_percentage: 8,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // Risk Register endpoints
  http.get('/api/v1/compliance/erm/risk-register/risks', async () => {
    await delay(120)
    return HttpResponse.json([
      { id: 'RSK-001', name: 'Cloud provider outage', description: 'Single cloud provider failure causes widespread service disruption across production clusters.', category: 'Technology', likelihood: 3, impact: 5, score: 15, owner: 'CTO', status: 'Open', last_review: '2025-01-10T00:00:00Z', next_review: '2025-04-10T00:00:00Z', mitigation_plan: 'Implement multi-cloud strategy with automatic failover. Deploy across AWS, GCP, and Azure with cross-region replication.', controls: ['Multi-region deployment', 'Auto-failover', 'DR playbook'], created_at: '2024-06-15T00:00:00Z' },
      { id: 'RSK-002', name: 'Data breach via supply chain', description: 'Compromised third-party dependency introduces vulnerability enabling data exfiltration.', category: 'Technology', likelihood: 4, impact: 5, score: 20, owner: 'CISO', status: 'Mitigating', last_review: '2025-01-08T00:00:00Z', next_review: '2025-02-08T00:00:00Z', mitigation_plan: 'SBOM scanning on all images, Sigstore verification required for production. SLSA L3 for critical builds.', controls: ['SBOM scanning', 'Sigstore verification', 'SLSA L3', 'Dependency review'], created_at: '2024-03-10T00:00:00Z' },
      { id: 'RSK-003', name: 'Regulatory non-compliance fine', description: 'Failure to meet SOC 2 or PCI-DSS requirements leading to regulatory penalties.', category: 'Compliance', likelihood: 2, impact: 5, score: 10, owner: 'CCO', status: 'Open', last_review: '2025-01-05T00:00:00Z', next_review: '2025-03-05T00:00:00Z', mitigation_plan: 'Continuous compliance monitoring with automated evidence collection. Quarterly audits.', controls: ['Compliance dashboard', 'Automated evidence', 'Quarterly audits'], created_at: '2024-01-20T00:00:00Z' },
      { id: 'RSK-004', name: 'Key personnel departure', description: 'Loss of critical engineering or security staff creates knowledge gaps.', category: 'Operational', likelihood: 3, impact: 4, score: 12, owner: 'CHRO', status: 'Accepted', last_review: '2025-01-12T00:00:00Z', next_review: '2025-04-12T00:00:00Z', mitigation_plan: 'Cross-training program, comprehensive documentation, competitive retention packages.', controls: ['Knowledge base', 'Cross-training', 'Retention packages'], created_at: '2024-05-01T00:00:00Z' },
      { id: 'RSK-005', name: 'Market share erosion', description: 'Competitors launching similar platforms reduces customer acquisition and retention.', category: 'Strategic', likelihood: 3, impact: 3, score: 9, owner: 'CSO', status: 'Open', last_review: '2025-01-06T00:00:00Z', next_review: '2025-04-06T00:00:00Z', mitigation_plan: 'Accelerate feature development, enhance enterprise integrations, strengthen community.', controls: ['Competitive analysis', 'Feature roadmap', 'Community growth'], created_at: '2024-07-15T00:00:00Z' },
      { id: 'RSK-006', name: 'Currency exchange volatility', description: 'Unfavorable exchange rates impacting international revenue and costs.', category: 'Financial', likelihood: 4, impact: 3, score: 12, owner: 'CFO', status: 'Mitigating', last_review: '2025-01-11T00:00:00Z', next_review: '2025-03-11T00:00:00Z', mitigation_plan: 'Hedging strategy for major currency pairs, invoice in local currencies where possible.', controls: ['FX hedging', 'Multi-currency billing', 'Treasury management'], created_at: '2024-09-01T00:00:00Z' },
      { id: 'RSK-007', name: 'Negative media coverage', description: 'Public relations incident damages brand and customer trust.', category: 'Reputational', likelihood: 2, impact: 4, score: 8, owner: 'CMO', status: 'Open', last_review: '2025-01-09T00:00:00Z', next_review: '2025-04-09T00:00:00Z', mitigation_plan: 'Crisis communication plan, media monitoring, proactive transparency reports.', controls: ['Crisis comms plan', 'Media monitoring', 'PR team'], created_at: '2024-04-20T00:00:00Z' },
      { id: 'RSK-008', name: 'Kubernetes cluster compromise', description: 'Unauthorized access to production clusters enabling lateral movement.', category: 'Technology', likelihood: 3, impact: 5, score: 15, owner: 'CISO', status: 'Mitigating', last_review: '2025-01-13T00:00:00Z', next_review: '2025-02-13T00:00:00Z', mitigation_plan: 'Zero-trust architecture, RBAC audit, network policies, runtime security with Falco.', controls: ['RBAC audit', 'Network policies', 'Falco alerts', 'Pod security standards'], created_at: '2024-02-15T00:00:00Z' },
      { id: 'RSK-009', name: 'Third-party vendor bankruptcy', description: 'Critical vendor going out of business disrupts service delivery.', category: 'Operational', likelihood: 2, impact: 3, score: 6, owner: 'CPO', status: 'Accepted', last_review: '2025-01-07T00:00:00Z', next_review: '2025-07-07T00:00:00Z', mitigation_plan: 'Vendor diversity strategy, escrow agreements for source code, contract exit clauses.', controls: ['Vendor diversity', 'Code escrow', 'Exit clauses'], created_at: '2024-08-10T00:00:00Z' },
      { id: 'RSK-010', name: 'Insider threat data exfiltration', description: 'Malicious insider copies sensitive data for unauthorized purposes.', category: 'Technology', likelihood: 2, impact: 5, score: 10, owner: 'CISO', status: 'Open', last_review: '2025-01-14T00:00:00Z', next_review: '2025-03-14T00:00:00Z', mitigation_plan: 'DLP policies, SIEM monitoring, least-privilege access, session recording.', controls: ['DLP', 'SIEM', 'Least privilege', 'Session recording'], created_at: '2024-06-01T00:00:00Z' },
      { id: 'RSK-016', name: 'GDPR violation', description: 'Non-compliance with EU data protection regulation resulting in fines up to 4% of revenue.', category: 'Compliance', likelihood: 2, impact: 5, score: 10, owner: 'DPO', status: 'Mitigating', last_review: '2025-01-11T00:00:00Z', next_review: '2025-02-11T00:00:00Z', mitigation_plan: 'Data residency controls, consent management, DPIA for all new processing, breach notification workflow.', controls: ['Data residency', 'Consent management', 'DPIA', 'Breach notification'], created_at: '2024-01-05T00:00:00Z' },
      { id: 'RSK-017', name: 'Critical CVE in base images', description: 'Zero-day or critical vulnerability in container base images deployed across fleet.', category: 'Technology', likelihood: 4, impact: 4, score: 16, owner: 'CISO', status: 'Mitigating', last_review: '2025-01-14T00:00:00Z', next_review: '2025-02-14T00:00:00Z', mitigation_plan: 'Automated image scanning in CI/CD, distroless base images, rapid patching SLA of 24h for critical CVEs.', controls: ['Image scanning', 'Distroless images', 'Patch SLA', 'Admission controllers'], created_at: '2024-04-01T00:00:00Z' },
    ])
  }),

  http.get('/api/v1/compliance/erm/risk-register/categories', async () => {
    await delay(80)
    return HttpResponse.json([
      { category: 'Operational', count: 4, avg_score: 8.8, open: 1 },
      { category: 'Strategic', count: 3, avg_score: 8.7, open: 2 },
      { category: 'Financial', count: 2, avg_score: 10.0, open: 0 },
      { category: 'Compliance', count: 2, avg_score: 10.0, open: 1 },
      { category: 'Technology', count: 6, avg_score: 14.3, open: 2 },
      { category: 'Reputational', count: 2, avg_score: 6.5, open: 1 },
    ])
  }),

  http.get('/api/v1/compliance/erm/risk-register/summary', async () => {
    await delay(80)
    return HttpResponse.json({
      total_risks: 18,
      open_risks: 8,
      overdue_reviews: 2,
      avg_risk_score: 10.7,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // Risk Appetite endpoints
  http.get('/api/v1/compliance/erm/risk-appetite/thresholds', async () => {
    await delay(100)
    return HttpResponse.json([
      { category: 'Operational', appetite_level: 12, actual_exposure: 10, tolerance_max: 15, status: 'green', statement: 'We accept moderate operational disruption risk provided failover and DR plans are tested quarterly.', trend_quarters: [8, 9, 11, 10] },
      { category: 'Strategic', appetite_level: 10, actual_exposure: 9, tolerance_max: 14, status: 'green', statement: 'We pursue calculated strategic risks that align with 3-year growth targets.', trend_quarters: [7, 8, 10, 9] },
      { category: 'Financial', appetite_level: 8, actual_exposure: 10, tolerance_max: 12, status: 'amber', statement: 'We maintain conservative financial risk appetite with FX hedging for all major exposures.', trend_quarters: [6, 7, 9, 10] },
      { category: 'Compliance', appetite_level: 5, actual_exposure: 8, tolerance_max: 7, status: 'red', statement: 'Zero tolerance for compliance breaches. All regulatory requirements must be met with evidence.', trend_quarters: [3, 4, 6, 8] },
      { category: 'Technology', appetite_level: 12, actual_exposure: 14, tolerance_max: 16, status: 'amber', statement: 'We accept technology risk proportional to innovation velocity, with mandatory security gates.', trend_quarters: [10, 11, 13, 14] },
      { category: 'Reputational', appetite_level: 6, actual_exposure: 5, tolerance_max: 8, status: 'green', statement: 'We protect brand reputation aggressively with proactive communication and transparency.', trend_quarters: [4, 5, 5, 5] },
    ])
  }),

  http.get('/api/v1/compliance/erm/risk-appetite/kris', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'KRI-001', name: 'System uptime SLA', category: 'Operational', threshold: 99.9, actual: 99.7, unit: '%', status: 'amber', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-002', name: 'Mean time to detect (MTTD)', category: 'Technology', threshold: 30, actual: 22, unit: 'minutes', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-003', name: 'Open critical vulnerabilities', category: 'Technology', threshold: 5, actual: 7, unit: 'count', status: 'red', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-004', name: 'Compliance audit findings', category: 'Compliance', threshold: 3, actual: 5, unit: 'findings', status: 'red', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-005', name: 'Employee turnover rate', category: 'Operational', threshold: 15, actual: 12, unit: '%', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-006', name: 'Revenue concentration top client', category: 'Financial', threshold: 25, actual: 22, unit: '%', status: 'amber', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-007', name: 'Patch compliance within SLA', category: 'Technology', threshold: 95, actual: 88, unit: '%', status: 'amber', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-008', name: 'Customer NPS score', category: 'Reputational', threshold: 50, actual: 62, unit: 'score', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-009', name: 'Vendor risk assessments overdue', category: 'Operational', threshold: 2, actual: 1, unit: 'count', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-010', name: 'Data breach incidents YTD', category: 'Technology', threshold: 0, actual: 0, unit: 'count', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-011', name: 'Budget variance', category: 'Financial', threshold: 10, actual: 8, unit: '%', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-012', name: 'Regulatory change backlog', category: 'Compliance', threshold: 5, actual: 4, unit: 'items', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
    ])
  }),

  http.get('/api/v1/compliance/erm/risk-appetite/summary', async () => {
    await delay(80)
    return HttpResponse.json({
      total_categories: 6,
      breaches: 1,
      amber_warnings: 2,
      within_appetite: 3,
      total_kris: 12,
      kri_breaches: 2,
      evaluated_at: new Date().toISOString(),
    })
  }),

  http.get('/api/cards/templates', async () => {
    await delay(100)
    return HttpResponse.json({
      templates: [
        { id: 'cluster_health', name: 'Cluster Health', category: 'monitoring' },
        { id: 'pod_issues', name: 'Pod Issues', category: 'issues' },
        { id: 'deployment_issues', name: 'Deployment Issues', category: 'issues' },
        { id: 'gpu_overview', name: 'GPU Overview', category: 'resources' },
        { id: 'gpu_status', name: 'GPU Status', category: 'resources' },
        { id: 'event_stream', name: 'Event Stream', category: 'activity' },
        { id: 'resource_usage', name: 'Resource Usage', category: 'resources' },
        { id: 'security_issues', name: 'Security Issues', category: 'security' },
      ],
    })
  }),

  // Save card configuration (for sharing)
  http.post('/api/cards/save', async ({ request }) => {
    await delay(100)
    const body = (await request.json()) as { id: string; config: unknown }
    const shareId = `card-${Date.now()}`
    savedCards[shareId] = body
    pruneRegistry(savedCards)
    return HttpResponse.json({
      success: true,
      shareId,
      shareUrl: `/shared/card/${shareId}`,
    })
  }),

  // Get shared card
  http.get('/api/cards/shared/:shareId', async ({ params }) => {
    await delay(100)
    const card = savedCards[params.shareId as string]
    if (card) {
      return HttpResponse.json({ card })
    }
    return HttpResponse.json({ error: 'Card not found' }, { status: 404 })
  }),

]
}
