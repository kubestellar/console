/**
 * Drasi Pipelines — Demo Data & Type Definitions
 *
 * Models Drasi reactive pipeline status for the dashboard monitoring card.
 * Shown when no cluster is connected or in demo mode.
 *
 * Upstream issue: kubestellar/console#19911
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DrasiPipelineStatus = 'running' | 'stopped' | 'error'

export interface DrasiPipelineData {
  /** Human-readable pipeline name */
  pipelineName: string
  /** Current operational status */
  status: DrasiPipelineStatus
  /** Number of continuous queries in this pipeline */
  continuousQueriesCount: number
  /** Number of reactions attached to this pipeline */
  reactionsCount: number
  /** ISO timestamp of the last event processed by this pipeline */
  lastEventAt: string
}

// ---------------------------------------------------------------------------
// Demo data factory
// ---------------------------------------------------------------------------

/**
 * Generates a realistic set of Drasi pipeline status entries for demo mode.
 * Timestamps are fresh on every call so the card always shows recent activity.
 */
export function generateDrasiPipelines(): DrasiPipelineData[] {
  const now = Date.now()
  return [
    {
      pipelineName: 'stock-ticker',
      status: 'running',
      continuousQueriesCount: 4,
      reactionsCount: 1,
      lastEventAt: new Date(now - Math.floor(Math.random() * 60_000)).toISOString(),
    },
    {
      pipelineName: 'fraud-detection',
      status: 'running',
      continuousQueriesCount: 3,
      reactionsCount: 3,
      lastEventAt: new Date(now - Math.floor(Math.random() * 120_000)).toISOString(),
    },
    {
      pipelineName: 'retail-analytics',
      status: 'running',
      continuousQueriesCount: 3,
      reactionsCount: 3,
      lastEventAt: new Date(now - Math.floor(Math.random() * 300_000)).toISOString(),
    },
    {
      pipelineName: 'iot-telemetry',
      status: 'stopped',
      continuousQueriesCount: 3,
      reactionsCount: 3,
      lastEventAt: new Date(now - Math.floor(Math.random() * 3_600_000)).toISOString(),
    },
    {
      pipelineName: 'supply-chain',
      status: 'error',
      continuousQueriesCount: 3,
      reactionsCount: 3,
      lastEventAt: new Date(now - Math.floor(Math.random() * 600_000)).toISOString(),
    },
  ]
}

/** Static demo data snapshot — use `generateDrasiPipelines()` for fresh timestamps. */
export const DRASI_PIPELINES_DEMO_DATA: DrasiPipelineData[] = generateDrasiPipelines()
