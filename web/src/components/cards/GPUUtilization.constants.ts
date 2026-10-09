import { CHART_HEIGHT_COMPACT } from '../../lib/constants'
import { PURPLE_600, GREEN_500_BRIGHT } from '../../lib/theme/chartColors'

export const GPU_RING_SIZE_PX = 80
export const GPU_RING_CONTAINER_STYLE = { minWidth: GPU_RING_SIZE_PX, minHeight: GPU_RING_SIZE_PX } as const
export const GPU_RING_CHART_STYLE = { height: GPU_RING_SIZE_PX, width: GPU_RING_SIZE_PX } as const
export const GPU_TREND_CHART_CONTAINER_STYLE = { width: '100%', minHeight: CHART_HEIGHT_COMPACT, height: CHART_HEIGHT_COMPACT } as const
export const GPU_TREND_CHART_STYLE = { height: CHART_HEIGHT_COMPACT, width: '100%' } as const

// GPU utilization pie chart colors
export const GPU_ALLOCATED_COLOR = PURPLE_600
export const GPU_AVAILABLE_COLOR = GREEN_500_BRIGHT

export interface GPUPoint {
  time: string
  allocated: number
  available: number
  total: number
}

/** Opacity at the top of area-fill gradients */
export const AREA_GRADIENT_TOP_ALPHA = 0.4
/** Opacity at the bottom of area-fill gradients (fully transparent) */
export const AREA_GRADIENT_BOTTOM_ALPHA = 0
/** Font size for mark-line labels on the chart */
export const MARK_LINE_FONT_SIZE = 9

export type TimeRange = '15m' | '1h' | '6h' | '24h'

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '15m', label: '15 min' },
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
]
