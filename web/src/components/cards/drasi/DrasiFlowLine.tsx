/**
 * SVG flow line with animated dots for the Drasi Reactive Graph.
 *
 * Exports: FlowLine, flowStateColors, seededRand, TRAFFIC_PATTERNS
 */
import { useReducedMotion } from 'framer-motion'
import {
  FLOW_COLOR_ACTIVE_STROKE, FLOW_COLOR_ACTIVE_DOT,
  FLOW_COLOR_IDLE, FLOW_COLOR_STOPPED,
  FLOW_COLOR_ERROR_STROKE, FLOW_COLOR_ERROR_DOT,
  FLOW_OPACITY_ACTIVE, FLOW_OPACITY_IDLE, FLOW_OPACITY_STOPPED, FLOW_OPACITY_ERROR,
  FLOW_DOT_CYCLE_S, LINE_STROKE_WIDTH_PX, FLOW_DOT_RADIUS_PX,
} from './DrasiConstants'
import type { FlowLineState } from './DrasiTypes'

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

/** Map a flow state to its stroke + dot colors. Pulled from CSS vars in
 *  index.css so the palette stays consistent with status badges elsewhere. */
export function flowStateColors(state: FlowLineState): { stroke: string; dot: string; opacity: number } {
  switch (state) {
    case 'active':
      return { stroke: FLOW_COLOR_ACTIVE_STROKE, dot: FLOW_COLOR_ACTIVE_DOT, opacity: FLOW_OPACITY_ACTIVE }
    case 'idle':
      return { stroke: FLOW_COLOR_IDLE, dot: FLOW_COLOR_IDLE, opacity: FLOW_OPACITY_IDLE }
    case 'stopped':
      return { stroke: FLOW_COLOR_STOPPED, dot: FLOW_COLOR_STOPPED, opacity: FLOW_OPACITY_STOPPED }
    case 'error':
      return { stroke: FLOW_COLOR_ERROR_STROKE, dot: FLOW_COLOR_ERROR_DOT, opacity: FLOW_OPACITY_ERROR }
  }
}

// ---------------------------------------------------------------------------
// Deterministic jitter
// ---------------------------------------------------------------------------

// Deterministic 0..1 pseudo-random seeded by a string key, so each flow
// line gets stable timing variation that doesn't jitter on every re-render.
export function seededRand(key: string, salt: number): number {
  let h = salt
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 2654435761)
  }
  return ((h >>> 0) % 10000) / 10000
}

// ---------------------------------------------------------------------------
// Traffic patterns
// ---------------------------------------------------------------------------

/**
 * Traffic pattern templates. Each entry gives normalized start offsets
 * (0..1 of the cycle) so the dot distribution varies between lines —
 * some carry a lone scout, some a tight burst, some an even stream.
 */
export const TRAFFIC_PATTERNS: ReadonlyArray<ReadonlyArray<number>> = [
  [0.5],                      // solo: single dot
  [0.45, 0.55],               // pair: two dots close
  [0.40, 0.50, 0.60],         // cluster: tight triple
  [0.00, 0.33, 0.67],         // even: metronomic triple
  [0.15, 0.55, 0.85],         // uneven: irregular triple
  [0.20, 0.70],               // spaced pair
  [0.10, 0.20, 0.55, 0.90],   // burst + trail (4 dots)
]

// ---------------------------------------------------------------------------
// FlowLine component
// ---------------------------------------------------------------------------

interface FlowLineProps {
  d: string
  dashed?: boolean
  active?: boolean
  delay?: number
  /** Connected-node state. Defaults to 'active' for backwards compat. */
  state?: FlowLineState
  /** When true (something else is hovered), the line fades out. */
  dimmed?: boolean
  lineKey?: string
}

export function FlowLine({
  d, dashed, active = true, delay = 0, lineKey = '', state = 'active', dimmed = false,
}: FlowLineProps) {
  // SVG SMIL <animateMotion> is NOT controlled by the global
  // `@media (prefers-reduced-motion: reduce)` CSS rules, so we must gate
  // the animated flow dots behind a JS check of the user preference (#7885).
  const prefersReducedMotion = useReducedMotion()
  // Stopped / error / dashed lines get no animated dots.
  const isAnimated = active && !dashed && !prefersReducedMotion && state === 'active'
  // Per-line cycle duration varies so flows aren't synchronized.
  const lineDur = FLOW_DOT_CYCLE_S + seededRand(lineKey, 1) * 3  // 5s–8s
  // Pick a traffic pattern deterministically from the line key.
  const patternIdx = Math.floor(seededRand(lineKey, 2) * TRAFFIC_PATTERNS.length)
  const pattern = TRAFFIC_PATTERNS[patternIdx]
  const colors = flowStateColors(state)
  // Hovering a node fades every disconnected line down to ~15% — keeps the
  // graph context visible while highlighting the focused subgraph.
  const dimMultiplier = dimmed ? 0.2 : 1
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={colors.stroke}
        strokeOpacity={(dashed ? 0.35 : colors.opacity) * dimMultiplier}
        strokeWidth={LINE_STROKE_WIDTH_PX}
        strokeDasharray={dashed ? '4 4' : undefined}
        vectorEffect="non-scaling-stroke"
        style={{ transition: 'stroke-opacity 200ms ease' }}
      />
      {isAnimated && pattern.map((offset, i) => {
        const begin = delay + offset * lineDur
        return (
          <circle key={i} r={FLOW_DOT_RADIUS_PX} fill={colors.dot} fillOpacity={0.9 * dimMultiplier}>
            <animateMotion
              dur={`${lineDur}s`}
              repeatCount="indefinite"
              begin={`${Math.max(0, begin)}s`}
              path={d}
            />
          </circle>
        )
      })}
    </>
  )
}
