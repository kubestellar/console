import { http, HttpResponse, delay } from 'msw'
import {
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

export function createComplianceHipaaHandlers() {
  return [
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

  ]
}
