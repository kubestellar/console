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



export function createErmRiskAppetiteHandlers() {
  return [
  http.get('/api/v1/compliance/erm/risk-appetite/thresholds', async () => {
    await delay(100)
    return HttpResponse.json([
      { category: 'Operational', appetite_level: 12, actual_exposure: 10, tolerance_max: 15, status: 'green', statement: 'We accept moderate operational disruption risk provided failover and DR plans are tested quarterly.', trend_quarters: [8, 9, 11, 10] },
      { category: 'Strategic', appetite_level: 10, actual_exposure: 9, tolerance_max: 14, status: 'green', statement: 'We pursue calculated strategic risks that align with 3-year growth targets.', trend_quarters: [7, 8, 10, 9] },
      { category: 'Financial', appetite_level: 8, actual_exposure: 10, tolerance_max: 12, status: 'amber', statement: 'We maintain conservative financial risk appetite with FX hedging for all major exposures.', trend_quarters: [6, 7, 9, 10] },
      { category: 'Compliance', appetite_level: 5, actual_exposure: 8, tolerance_max: 7, status: 'red', statement: 'Zero tolerance for compliance breaches. All regulatory requirements must be met with evidence.', trend_quarters: [3, 4, 6, 8] },
      { category: 'Technology', appetite_level: 12, actual_exposure: 14, tolerance_max: 16, status: 'amber', statement: 'We accept technology risk proportional to innovation velocity, with mandatory security gates.', trend_quarters: [10, 11, 13, 14] },
      { category: 'Reputational', appetite_level: 6, actual_exposure: 5, tolerance_max: 8, status: 'green', statement: 'We protect brand reputation aggressively with proactive communication and transparency.', trend_quarters: [4, 5, 5, 5] },
    ])
  }),

  http.get('/api/v1/compliance/erm/risk-appetite/kris', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'KRI-001', name: 'System uptime SLA', category: 'Operational', threshold: 99.9, actual: 99.7, unit: '%', status: 'amber', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-002', name: 'Mean time to detect (MTTD)', category: 'Technology', threshold: 30, actual: 22, unit: 'minutes', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-003', name: 'Open critical vulnerabilities', category: 'Technology', threshold: 5, actual: 7, unit: 'count', status: 'red', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-004', name: 'Compliance audit findings', category: 'Compliance', threshold: 3, actual: 5, unit: 'findings', status: 'red', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-005', name: 'Employee turnover rate', category: 'Operational', threshold: 15, actual: 12, unit: '%', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-006', name: 'Revenue concentration top client', category: 'Financial', threshold: 25, actual: 22, unit: '%', status: 'amber', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-007', name: 'Patch compliance within SLA', category: 'Technology', threshold: 95, actual: 88, unit: '%', status: 'amber', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-008', name: 'Customer NPS score', category: 'Reputational', threshold: 50, actual: 62, unit: 'score', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-009', name: 'Vendor risk assessments overdue', category: 'Operational', threshold: 2, actual: 1, unit: 'count', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-010', name: 'Data breach incidents YTD', category: 'Technology', threshold: 0, actual: 0, unit: 'count', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-011', name: 'Budget variance', category: 'Financial', threshold: 10, actual: 8, unit: '%', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
      { id: 'KRI-012', name: 'Regulatory change backlog', category: 'Compliance', threshold: 5, actual: 4, unit: 'items', status: 'green', last_updated: '2025-01-14T00:00:00Z' },
    ])
  }),

  http.get('/api/v1/compliance/erm/risk-appetite/summary', async () => {
    await delay(80)
    return HttpResponse.json({
      total_categories: 6,
      breaches: 1,
      amber_warnings: 2,
      within_appetite: 3,
      total_kris: 12,
      kri_breaches: 2,
      evaluated_at: new Date().toISOString(),
    })
  }),
  ]
}
