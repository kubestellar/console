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



export function createComplianceResidencyHandlers() {
  return [
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
  ]
}
