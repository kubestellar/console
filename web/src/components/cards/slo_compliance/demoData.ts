/**
 * Demo data and type definitions for the SLO Compliance Tracker card.
 *
 * Tracks Service Level Objective compliance across inference workloads,
 * showing budget burn rates and compliance percentages per target.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SLOTarget {
  name: string
  metric: string
  threshold: number
  unit: string
  window: string
  currentCompliance: number
}

export interface SLOComplianceData {
  targets: SLOTarget[]
  overallBudgetRemaining: number
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_LAST_CHECK_AGE_MS = 30_000

const DEMO_LATENCY_THRESHOLD = 500
const DEMO_LATENCY_COMPLIANCE = 97.2

const DEMO_ERROR_RATE_THRESHOLD = 0.1
const DEMO_ERROR_RATE_COMPLIANCE = 99.8

const DEMO_AVAILABILITY_THRESHOLD = 99.9
const DEMO_AVAILABILITY_COMPLIANCE = 99.95

const DEMO_OVERALL_BUDGET_REMAINING = 72.5

// ---------------------------------------------------------------------------
// Demo Data
// ---------------------------------------------------------------------------

export const SLO_COMPLIANCE_DEMO_DATA: SLOComplianceData = {
  targets: [
    {
      name: 'Inference P99 Latency',
      metric: 'inference_latency_p99_ms',
      threshold: DEMO_LATENCY_THRESHOLD,
      unit: 'ms',
      window: '30d',
      currentCompliance: DEMO_LATENCY_COMPLIANCE,
    },
    {
      name: 'Error Rate',
      metric: 'inference_error_rate',
      threshold: DEMO_ERROR_RATE_THRESHOLD,
      unit: '%',
      window: '30d',
      currentCompliance: DEMO_ERROR_RATE_COMPLIANCE,
    },
    {
      name: 'Availability',
      metric: 'service_availability',
      threshold: DEMO_AVAILABILITY_THRESHOLD,
      unit: '%',
      window: '30d',
      currentCompliance: DEMO_AVAILABILITY_COMPLIANCE,
    },
  ],
  overallBudgetRemaining: DEMO_OVERALL_BUDGET_REMAINING,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_AGE_MS).toISOString(),
}
