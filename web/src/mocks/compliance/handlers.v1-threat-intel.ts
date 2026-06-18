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



export function createV1ThreatIntelHandlers() {
  return [
  http.get('/api/v1/compliance/threat-intel/feeds', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'feed-001', name: 'MITRE ATT&CK', provider: 'MITRE Corporation', status: 'active', last_updated: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), indicators_count: 14500, category: 'TTPs' },
      { id: 'feed-002', name: 'AlienVault OTX', provider: 'AT&T Cybersecurity', status: 'active', last_updated: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), indicators_count: 89200, category: 'IOCs' },
      { id: 'feed-003', name: 'Abuse.ch URLhaus', provider: 'abuse.ch', status: 'active', last_updated: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), indicators_count: 42100, category: 'Malware' },
      { id: 'feed-004', name: 'CISA KEV', provider: 'CISA', status: 'active', last_updated: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), indicators_count: 1120, category: 'Vulnerabilities' },
      { id: 'feed-005', name: 'Custom Internal Feed', provider: 'Internal SOC', status: 'stale', last_updated: new Date(Date.now() - DEMO_1_WEEK_MS).toISOString(), indicators_count: 340, category: 'Internal' },
      { id: 'feed-006', name: 'PhishTank', provider: 'OpenDNS', status: 'active', last_updated: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), indicators_count: 28700, category: 'Phishing' },
    ])
  }),

  http.get('/api/v1/compliance/threat-intel/iocs', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'ioc-001', ioc_type: 'ip', indicator: '198.51.100.42', feed_name: 'AlienVault OTX', severity: 'critical', matched_resource: 'pod/api-gateway', cluster: 'prod-east-1', detected_at: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), status: 'active' },
      { id: 'ioc-002', ioc_type: 'domain', indicator: 'malware-c2.example.net', feed_name: 'Abuse.ch URLhaus', severity: 'critical', matched_resource: 'pod/worker-processor', cluster: 'prod-east-1', detected_at: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), status: 'active' },
      { id: 'ioc-003', ioc_type: 'hash', indicator: 'a1b2c3d4e5f6...', feed_name: 'AlienVault OTX', severity: 'high', matched_resource: 'image/nginx:1.24', cluster: 'prod-west-2', detected_at: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), status: 'mitigated' },
      { id: 'ioc-004', ioc_type: 'ip', indicator: '203.0.113.99', feed_name: 'CISA KEV', severity: 'high', matched_resource: 'service/ingress-nginx', cluster: 'staging-1', detected_at: new Date(Date.now() - DEMO_8_HOUR_MS).toISOString(), status: 'active' },
      { id: 'ioc-005', ioc_type: 'url', indicator: 'http://phish.example.com/login', feed_name: 'PhishTank', severity: 'medium', matched_resource: 'pod/web-frontend', cluster: 'prod-east-1', detected_at: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), status: 'false_positive' },
      { id: 'ioc-006', ioc_type: 'domain', indicator: 'crypto-miner.example.org', feed_name: 'Abuse.ch URLhaus', severity: 'high', matched_resource: 'pod/batch-worker', cluster: 'dev-1', detected_at: new Date(Date.now() - DEMO_2_DAY_MS).toISOString(), status: 'mitigated' },
    ])
  }),

  http.get('/api/v1/compliance/threat-intel/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_feeds: 6,
      active_feeds: 5,
      total_indicators: 175960,
      total_matches: 23,
      active_matches: 8,
      risk_score: 42,
      critical_matches: 3,
      high_matches: 7,
      medium_matches: 9,
      low_matches: 4,
      top_ioc_types: [
        { type: 'ip', count: 9 },
        { type: 'domain', count: 6 },
        { type: 'hash', count: 4 },
        { type: 'url', count: 3 },
        { type: 'email', count: 1 },
      ],
      vulnerability_correlation: 73,
    })
  }),

  // Card templates
  // ── Epic 6: Supply Chain Security ─────────────────────────────────────

  // SBOM endpoints
  ]
}
