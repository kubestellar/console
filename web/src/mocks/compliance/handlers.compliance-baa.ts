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

export function createComplianceBaaHandlers() {
  return [
  http.get('/api/compliance/baa/agreements', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'baa-001', provider: 'Amazon Web Services', provider_type: 'cloud', baa_signed_date: '2025-06-15', baa_expiry_date: '2027-06-15', covered_clusters: ['prod-east', 'staging-east'], contact_name: 'AWS Enterprise Support', contact_email: 'aws-baa@example.com', status: 'active', notes: 'Covers all HIPAA-eligible services in us-east-1' },
      { id: 'baa-002', provider: 'Google Cloud Platform', provider_type: 'cloud', baa_signed_date: '2025-08-01', baa_expiry_date: '2026-08-01', covered_clusters: ['prod-west'], contact_name: 'GCP Healthcare Team', contact_email: 'gcp-baa@example.com', status: 'active', notes: 'Covers GKE, Cloud SQL, BigQuery in us-west1' },
      { id: 'baa-003', provider: 'Datadog', provider_type: 'saas', baa_signed_date: '2025-03-01', baa_expiry_date: '2026-05-15', covered_clusters: ['prod-east', 'prod-west'], contact_name: 'Datadog Compliance', contact_email: 'compliance@datadog.example.com', status: 'expiring_soon', notes: 'Monitoring and logging for PHI workloads' },
      { id: 'baa-004', provider: 'Snowflake', provider_type: 'saas', baa_signed_date: '2024-01-01', baa_expiry_date: '2026-01-01', covered_clusters: [], contact_name: 'Snowflake Legal', contact_email: 'legal@snowflake.example.com', status: 'expired', notes: 'Analytics warehouse — BAA lapsed' },
      { id: 'baa-005', provider: 'Acme Consulting', provider_type: 'consulting', baa_signed_date: '', baa_expiry_date: '', covered_clusters: ['dev-central'], contact_name: 'Acme PM', contact_email: 'pm@acme.example.com', status: 'pending', notes: 'BAA under legal review' },
      { id: 'baa-006', provider: 'Azure', provider_type: 'cloud', baa_signed_date: '2025-11-01', baa_expiry_date: '2027-11-01', covered_clusters: ['dr-central'], contact_name: 'Microsoft Enterprise', contact_email: 'azure-baa@example.com', status: 'active', notes: 'Disaster recovery in Central US' },
    ])
  }),

  http.get('/api/compliance/baa/alerts', async () => {
    await delay(150)
    return HttpResponse.json([
      { agreement_id: 'baa-003', provider: 'Datadog', expiry_date: '2026-05-15', days_left: 22, severity: 'critical' },
      { agreement_id: 'baa-004', provider: 'Snowflake', expiry_date: '2026-01-01', days_left: 0, severity: 'critical' },
    ])
  }),

  http.get('/api/compliance/baa/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_agreements: 6, active_agreements: 3, expiring_soon: 1,
      expired: 1, pending: 1, covered_clusters: 5, uncovered_clusters: 1,
      active_alerts: 2, evaluated_at: new Date().toISOString(),
    })
  }),

  ]
}
