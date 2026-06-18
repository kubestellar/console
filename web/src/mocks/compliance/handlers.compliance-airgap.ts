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



export function createComplianceAirgapHandlers() {
  return [
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
  ]
}
