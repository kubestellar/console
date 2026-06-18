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

export function createComplianceFrameworksHandlers() {
  return [
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

  ]
}
