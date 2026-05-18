import type { NightlyGuideStatus, NightlyRun } from '../../../lib/llmd/nightlyE2EDemoData'

export const PLATFORM_ORDER = ['OCP', 'GKE', 'CKS'] as const

/** Minimum number of runs required before a guide's pass rate is considered meaningful */
export const MIN_RUNS_FOR_RATE = 3
export const TREND_CHART_WIDTH = 200
export const TREND_CHART_HEIGHT = 64
export const TREND_CHART_PADDING_LEFT = 30
export const TREND_CHART_PADDING_RIGHT = 12
export const TREND_CHART_PADDING_TOP = 10
export const TREND_CHART_PADDING_BOTTOM = 18
export const TREND_CHART_AXIS_TICK_LENGTH = 4
export const TREND_CHART_LABEL_FONT_SIZE = 8
export const TREND_CHART_X_LABEL_FONT_SIZE = 7
export const TREND_CHART_POINT_RADIUS = 2.5
export const TREND_CHART_LATEST_POINT_RADIUS = 3.5
export const TREND_CHART_POINT_STROKE_WIDTH = 1.5
export const TREND_CHART_LINE_STROKE_WIDTH = 2
export const TREND_CHART_GRID_STROKE_WIDTH = 0.75
export const TREND_CHART_AXIS_STROKE_WIDTH = 1
export const TREND_CHART_AXIS_COLOR = 'hsl(var(--foreground))'
export const TREND_CHART_LABEL_COLOR = 'hsl(var(--foreground))'
export const TREND_CHART_MUTED_LABEL_COLOR = 'hsl(var(--muted-foreground))'
export const TREND_CHART_GRID_COLOR = 'hsl(var(--muted-foreground))'
export const TREND_CHART_POINT_STROKE_COLOR = 'hsl(var(--background))'

export const PLATFORM_COLORS: Record<string, string> = {
  OCP: '#ef4444',  // red
  GKE: '#3b82f6',  // blue
  CKS: '#a855f7',  // purple
}

/** Get metadata from the guide's API response (model, gpuType, gpuCount are now server-provided) */
export function getGuideMeta(guide: NightlyGuideStatus) {
  return {
    model: guide.model || 'Unknown',
    gpuType: guide.gpuType || 'Unknown',
    gpuCount: guide.gpuCount || 0 }
}

export function computeAvgDurationMin(runs: NightlyRun[]): number | null {
  const completed = runs.filter(r => r.status === 'completed' && r.createdAt && r.updatedAt)
  if (completed.length === 0) return null
  const totalMs = completed.reduce((sum, r) => {
    return sum + (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime())
  }, 0)
  return Math.round(totalMs / completed.length / 60_000)
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
