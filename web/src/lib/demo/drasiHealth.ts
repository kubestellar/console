/**
 * Drasi Pipeline Health — Demo Data & Type Definitions
 *
 * Models aggregate health status across all Drasi pipelines for the
 * dashboard health summary card.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DrasiHealthLevel = 'healthy' | 'degraded' | 'down'

export interface DrasiPipelineHealthEntry {
  pipelineName: string
  health: DrasiHealthLevel
  sourcesTotal: number
  sourcesHealthy: number
  queriesTotal: number
  queriesHealthy: number
  reactionsTotal: number
  reactionsHealthy: number
  uptimePct: number
  lastCheckedAt: string
}

export interface DrasiHealthSummary {
  overallHealth: DrasiHealthLevel
  pipelines: DrasiPipelineHealthEntry[]
  totalSources: number
  healthySources: number
  totalQueries: number
  healthyQueries: number
  totalReactions: number
  healthyReactions: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum uptime percentage to be considered "healthy" */
const HEALTHY_UPTIME_THRESHOLD_PCT = 95

/** Uptime percentage below which a pipeline is considered "down" */
const DOWN_UPTIME_THRESHOLD_PCT = 50

// ---------------------------------------------------------------------------
// Demo data factory
// ---------------------------------------------------------------------------

export function generateDrasiHealthSummary(): DrasiHealthSummary {
  const now = Date.now()

  const pipelines: DrasiPipelineHealthEntry[] = [
    {
      pipelineName: 'stock-ticker',
      health: 'healthy',
      sourcesTotal: 2,
      sourcesHealthy: 2,
      queriesTotal: 4,
      queriesHealthy: 4,
      reactionsTotal: 1,
      reactionsHealthy: 1,
      uptimePct: 99.8,
      lastCheckedAt: new Date(now - 30_000).toISOString(),
    },
    {
      pipelineName: 'fraud-detection',
      health: 'healthy',
      sourcesTotal: 3,
      sourcesHealthy: 3,
      queriesTotal: 3,
      queriesHealthy: 3,
      reactionsTotal: 3,
      reactionsHealthy: 3,
      uptimePct: 99.5,
      lastCheckedAt: new Date(now - 45_000).toISOString(),
    },
    {
      pipelineName: 'retail-analytics',
      health: 'degraded',
      sourcesTotal: 2,
      sourcesHealthy: 1,
      queriesTotal: 3,
      queriesHealthy: 2,
      reactionsTotal: 3,
      reactionsHealthy: 3,
      uptimePct: 87.2,
      lastCheckedAt: new Date(now - 60_000).toISOString(),
    },
    {
      pipelineName: 'iot-telemetry',
      health: 'healthy',
      sourcesTotal: 5,
      sourcesHealthy: 5,
      queriesTotal: 3,
      queriesHealthy: 3,
      reactionsTotal: 3,
      reactionsHealthy: 3,
      uptimePct: 98.1,
      lastCheckedAt: new Date(now - 20_000).toISOString(),
    },
    {
      pipelineName: 'supply-chain',
      health: 'down',
      sourcesTotal: 2,
      sourcesHealthy: 0,
      queriesTotal: 3,
      queriesHealthy: 0,
      reactionsTotal: 3,
      reactionsHealthy: 0,
      uptimePct: 12.3,
      lastCheckedAt: new Date(now - 120_000).toISOString(),
    },
  ]

  const totalSources = pipelines.reduce((sum, p) => sum + p.sourcesTotal, 0)
  const healthySources = pipelines.reduce((sum, p) => sum + p.sourcesHealthy, 0)
  const totalQueries = pipelines.reduce((sum, p) => sum + p.queriesTotal, 0)
  const healthyQueries = pipelines.reduce((sum, p) => sum + p.queriesHealthy, 0)
  const totalReactions = pipelines.reduce((sum, p) => sum + p.reactionsTotal, 0)
  const healthyReactions = pipelines.reduce((sum, p) => sum + p.reactionsHealthy, 0)

  const hasDown = pipelines.some(p => p.health === 'down')
  const hasDegraded = pipelines.some(p => p.health === 'degraded')
  const overallHealth: DrasiHealthLevel = hasDown ? 'down' : hasDegraded ? 'degraded' : 'healthy'

  return {
    overallHealth,
    pipelines,
    totalSources,
    healthySources,
    totalQueries,
    healthyQueries,
    totalReactions,
    healthyReactions,
  }
}

export function deriveHealthLevel(uptimePct: number): DrasiHealthLevel {
  if (uptimePct >= HEALTHY_UPTIME_THRESHOLD_PCT) return 'healthy'
  if (uptimePct >= DOWN_UPTIME_THRESHOLD_PCT) return 'degraded'
  return 'down'
}
