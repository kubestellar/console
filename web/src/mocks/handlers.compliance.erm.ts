import { http, HttpResponse, delay } from 'msw'
import {
  pruneRegistry,
  savedCards,
} from './handlers.fixtures'

// Enterprise Risk Management (Epic 7) and card template
// mock handlers (demo mode).
export function createComplianceErmHandlers() {
  return [
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
