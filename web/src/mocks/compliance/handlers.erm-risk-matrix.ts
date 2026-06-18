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



export function createErmRiskMatrixHandlers() {
  return [
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
  ]
}
