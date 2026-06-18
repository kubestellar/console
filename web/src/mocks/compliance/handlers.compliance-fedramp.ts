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



export function createComplianceFedrampHandlers() {
  return [
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
  ]
}
