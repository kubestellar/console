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



export function createV1IncidentsHandlers() {
  return [
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
  ]
}
