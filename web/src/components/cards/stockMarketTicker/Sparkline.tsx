import { GREEN_500_BRIGHT, RED_500 } from '../../../lib/theme/chartColors'

export interface SparklineProps {
  data: number[]
  isPositive: boolean
}

/**
 * Minimal inline SVG sparkline showing a stock's recent price trend.
 * Extracted from StockMarketTicker.tsx (#21650).
 */
export function Sparkline({ data, isPositive }: SparklineProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 100
    return `${x},${y}`
  }).join(' ')

  return (
    <svg
      className="w-20 h-8"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Price trend: ${isPositive ? 'rising' : 'falling'}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? GREEN_500_BRIGHT : RED_500}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
