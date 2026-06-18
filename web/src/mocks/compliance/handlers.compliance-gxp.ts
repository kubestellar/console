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



export function createComplianceGxpHandlers() {
  return [
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
  ]
}
