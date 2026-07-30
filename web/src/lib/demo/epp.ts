/**
 * EPP Status — Demo Data & Type Definitions
 *
 * Monitoring metrics for EPP (Endpoint Picker Protocol) instances
 * in the llm-d inference stack. Surfaced when no cluster is connected
 * or the llm-d EPP endpoint is unavailable.
 *
 * Upstream issue: kubestellar/console#19910
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EPPStatusData {
  /** Number of active EPP instances */
  instanceCount: number
  /** Current request queue depth across all EPP instances */
  queueDepth: number
  /** Median request-routing latency in milliseconds */
  latencyP50Ms: number
  /** 99th-percentile request-routing latency in milliseconds */
  latencyP99Ms: number
  /** Fraction of requests that encountered an error (0–1) */
  errorRate: number
  /** ISO-8601 timestamp of the last status check */
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Constants (no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_INSTANCE_COUNT = 3
const DEMO_BASE_QUEUE_DEPTH = 12
const DEMO_BASE_LATENCY_P50_MS = 85
const DEMO_BASE_LATENCY_P99_MS = 420
const DEMO_BASE_ERROR_RATE = 0.023

/** Amplitude of the slow sinusoidal wave used to simulate realistic drift. */
const DEMO_WAVE_PERIOD_MS = 8000

// ---------------------------------------------------------------------------
// Demo data factory
// ---------------------------------------------------------------------------

/**
 * Generates a single realistic EPP status snapshot using a slow sinusoidal
 * wave combined with a small random jitter, following the pattern established
 * in `web/src/lib/llmd/mockData.ts`.
 */
export function generateEPPStatus(): EPPStatusData {
  const wave = Math.sin(Date.now() / DEMO_WAVE_PERIOD_MS)
  return {
    instanceCount: DEMO_INSTANCE_COUNT,
    queueDepth: Math.round(Math.max(0, DEMO_BASE_QUEUE_DEPTH + wave * 5 + Math.random() * 3)),
    latencyP50Ms: Math.round(DEMO_BASE_LATENCY_P50_MS + wave * 12 + Math.random() * 8),
    latencyP99Ms: Math.round(DEMO_BASE_LATENCY_P99_MS + wave * 50 + Math.random() * 30),
    errorRate: Math.max(0, DEMO_BASE_ERROR_RATE + wave * 0.01 + Math.random() * 0.005),
    lastCheckTime: new Date().toISOString(),
  }
}

export const EPP_DEMO_DATA: EPPStatusData = generateEPPStatus()
