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

export function createV1SiemHandlers() {
  return [
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

  ]
}
