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

export function createComplianceChangeControlHandlers() {
  return [
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

  ]
}
