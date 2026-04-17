/**
 * useCICDStats
 *
 * Provides stat block values for the CI/CD dashboard Stats Overview bar.
 * Reads from PipelineDataContext (unified fetch) so values update
 * instantly when the user changes the repo filter.
 */

import { useCallback, useMemo } from 'react'
import type { StatBlockValue } from '../ui/StatsOverview'
import { usePipelineData } from '../cards/pipelines/PipelineDataContext'
import type { Conclusion, FlowRun } from '../../hooks/useGitHubPipelines'

/** Milliseconds in 24 hours — used to filter recent failures */
const MS_PER_24H = 24 * 60 * 60 * 1000

/** Percentage thresholds for pass-rate coloring */
const PASS_RATE_GOOD_PCT = 90
const PASS_RATE_WARN_PCT = 70

/** Maximum value for pass-rate (100%) — used as gauge max */
const PASS_RATE_MAX = 100

/** Milliseconds per minute — used for duration formatting */
const MS_PER_MINUTE = 60_000

/** Minutes per hour — used for duration formatting */
const MINUTES_PER_HOUR = 60

/** Whether a conclusion counts as a "pass" */
function isPassing(c: Conclusion): boolean {
  return c === 'success' || c === 'skipped' || c === 'neutral'
}

/** Format milliseconds as a human-readable duration string */
function formatDuration(ms: number): string {
  const minutes = Math.round(ms / MS_PER_MINUTE)
  if (minutes < 1) return '<1m'
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const remainder = minutes % MINUTES_PER_HOUR
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
}

/** Return shape for useCICDStats — callers use these to drive DashboardPage lifecycle */
export interface CICDStatsResult {
  getStatValue: (blockId: string) => StatBlockValue
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
  error: string | null
  lastRefresh: number | null
  refetch: (() => Promise<void>) | null
}

export function useCICDStats(): CICDStatsResult {
  const pipelineData = usePipelineData()

  // Memoize computed values from pipeline data
  const computed = useMemo(() => {
    if (!pipelineData) {
      return {
        passRate: 0,
        totalRuns: 0,
        passCount: 0,
        failed24h: 0,
        avgDurationMs: 0,
        streak: 0,
        streakKind: 'mixed' as const,
        totalWorkflows: 0,
        openPRs: 0,
        isDemo: true,
        matrixDays: 0,
      }
    }

    const { matrix, pulse, failures, flow } = pipelineData

    // --- Pass Rate (window from matrix.days) ---
    let totalCells = 0
    let passingCells = 0
    for (const wf of (matrix?.workflows || [])) {
      for (const cell of (wf.cells || [])) {
        if (cell.conclusion !== null) {
          totalCells++
          if (isPassing(cell.conclusion)) passingCells++
        }
      }
    }
    const passRate = totalCells > 0 ? Math.round((passingCells / totalCells) * PASS_RATE_MAX) : 0

    // --- Failed (24h) ---
    const now = Date.now()
    const cutoff24h = now - MS_PER_24H
    const failed24h = (failures?.runs || []).filter(
      (r) => new Date(r.createdAt).getTime() >= cutoff24h
    ).length

    // --- Avg Duration (from flow runs that have completed) ---
    const completedRuns = (flow?.runs || []).filter(
      (r: FlowRun) => r.run.status === 'completed' && r.run.createdAt && r.run.updatedAt
    )
    let avgDurationMs = 0
    if (completedRuns.length > 0) {
      const totalMs = completedRuns.reduce((sum: number, r: FlowRun) => {
        const start = new Date(r.run.createdAt).getTime()
        const end = new Date(r.run.updatedAt).getTime()
        return sum + (end - start)
      }, 0)
      avgDurationMs = totalMs / completedRuns.length
    }

    // --- Nightly Streak (from pulse data) ---
    const streak = pulse?.streak ?? 0
    const streakKind = pulse?.streakKind ?? 'mixed'

    // --- Total Workflows (unique workflow names across all repos in matrix) ---
    const workflowNames = new Set<string>()
    for (const wf of (matrix?.workflows || [])) {
      workflowNames.add(wf.name)
    }
    const totalWorkflows = workflowNames.size

    // --- Open PRs (count from flow runs triggered by pull_request) ---
    const prNumbers = new Set<string>()
    for (const r of (flow?.runs || [])) {
      if (r.run.event === 'pull_request' && r.run.pullRequests) {
        for (const pr of r.run.pullRequests) {
          prNumbers.add(`${r.run.repo}#${pr.number}`)
        }
      }
    }
    const openPRs = prNumbers.size

    // Use the context's isDemoFallback for accurate demo detection —
    // a real repo with no recent activity should NOT be flagged as demo.
    const isDemo = pipelineData.isDemoFallback

    return {
      passRate,
      totalRuns: totalCells,
      passCount: passingCells,
      failed24h,
      avgDurationMs,
      streak,
      streakKind,
      totalWorkflows,
      openPRs,
      isDemo,
      matrixDays: matrix?.days ?? 0,
    }
  }, [pipelineData])

  const getStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'cicd_pass_rate': {
        const sublabel = computed.passRate >= PASS_RATE_GOOD_PCT
          ? 'Healthy'
          : computed.passRate >= PASS_RATE_WARN_PCT
            ? 'Needs attention'
            : 'Critical'
        return {
          value: computed.passRate,
          sublabel: computed.matrixDays > 0
            ? `${sublabel} (${computed.matrixDays}d)`
            : sublabel,
          max: PASS_RATE_MAX,
          isDemo: computed.isDemo,
          modeHints: ['ring', 'gauge', 'horseshoe', 'numeric'],
        }
      }

      case 'cicd_open_prs':
        return {
          value: computed.openPRs,
          sublabel: 'with active runs',
          isDemo: computed.isDemo,
        }

      case 'cicd_failed_24h':
        return {
          value: computed.failed24h,
          sublabel: computed.failed24h > 0 ? 'needs attention' : 'all clear',
          isDemo: computed.isDemo,
          modeHints: ['numeric', 'heatmap', 'trend'],
        }

      case 'cicd_avg_duration': {
        const formatted = computed.avgDurationMs > 0
          ? formatDuration(computed.avgDurationMs)
          : '-'
        return {
          value: formatted,
          sublabel: 'avg run time',
          isDemo: computed.isDemo,
        }
      }

      case 'cicd_streak': {
        const label = computed.streakKind === 'success'
          ? `${computed.streak} passing`
          : computed.streakKind === 'failure'
            ? `${computed.streak} failing`
            : 'mixed'
        return {
          value: computed.streak,
          sublabel: label,
          isDemo: computed.isDemo,
        }
      }

      case 'cicd_total_workflows':
        return {
          value: computed.totalWorkflows,
          sublabel: 'unique workflows',
          isDemo: computed.isDemo,
        }

      default:
        return { value: '-' }
    }
  }, [computed])

  return {
    getStatValue,
    isLoading: pipelineData?.isLoading ?? false,
    isRefreshing: pipelineData?.isRefreshing ?? false,
    isDemoData: computed.isDemo,
    error: pipelineData?.error ?? null,
    lastRefresh: pipelineData?.lastRefresh ?? null,
    refetch: pipelineData?.refetch ?? null,
  }
}
