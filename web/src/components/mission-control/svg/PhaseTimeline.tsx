/**
 * PhaseTimeline — Horizontal bar at the bottom of the Flight Plan SVG.
 * Phase segments light up sequentially with glow.
 */

import { motion } from 'framer-motion'
import type { DeployPhase, PhaseProgress, PhaseStatus } from '../types'

const STATUS_COLORS: Record<PhaseStatus, string> = {
  pending: '#475569',
  running: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
  skipped: '#64748b',
}

interface PhaseTimelineProps {
  id: string
  phases: DeployPhase[]
  progress: PhaseProgress[]
  viewBoxWidth: number
  y: number
}

export function PhaseTimeline({ phases, progress, viewBoxWidth, y }: PhaseTimelineProps) {
  if (phases.length === 0) return null

  const padding = 20
  const totalWidth = viewBoxWidth - padding * 2
  const segmentWidth = totalWidth / phases.length
  const barHeight = 20

  return (
    <g>
      {/* Label */}
      <text
        x={padding}
        y={y - 5}
        fill="white"
        fontSize={7}
        fontWeight="600"
        fontFamily="system-ui, sans-serif"
        opacity={0.6}
      >
        LAUNCH SEQUENCE
      </text>

      {/* Background bar */}
      <rect
        x={padding}
        y={y}
        width={totalWidth}
        height={barHeight}
        rx={4}
        fill="#1e293b"
        stroke="#334155"
        strokeWidth={0.5}
      />

      {/* Phase segments */}
      {phases.map((phase, i) => {
        const phaseProgress = progress.find((p) => p.phase === phase.phase)
        const status: PhaseStatus = phaseProgress?.status ?? 'pending'
        const color = STATUS_COLORS[status]
        const segX = padding + i * segmentWidth

        return (
          <g key={phase.phase}>
            {/* Segment fill */}
            <motion.rect
              x={segX + 1}
              y={y + 1}
              width={segmentWidth - 2}
              height={barHeight - 2}
              rx={3}
              fill={color}
              fillOpacity={status === 'pending' ? 0.15 : 0.4}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, delay: i * 0.2 }}
              style={{ transformOrigin: `${segX}px ${y}px` }}
            />

            {/* Separator */}
            {i > 0 && (
              <line
                x1={segX}
                y1={y + 3}
                x2={segX}
                y2={y + barHeight - 3}
                stroke="#475569"
                strokeWidth={0.5}
                opacity={0.5}
              />
            )}

            {/* Phase label */}
            <text
              x={segX + segmentWidth / 2}
              y={y + barHeight / 2 - 1}
              textAnchor="middle"
              fill="white"
              fontSize={5.5}
              fontWeight="600"
              fontFamily="system-ui, sans-serif"
              opacity={0.9}
            >
              {phase.name}
            </text>

            {/* Project names */}
            <text
              x={segX + segmentWidth / 2}
              y={y + barHeight / 2 + 5}
              textAnchor="middle"
              fill="white"
              fontSize={4}
              fontFamily="system-ui, sans-serif"
              opacity={0.5}
            >
              {phase.projectNames.slice(0, 3).join(', ')}
              {phase.projectNames.length > 3 && ` +${phase.projectNames.length - 3}`}
            </text>

            {/* Running glow */}
            {status === 'running' && (
              <rect
                x={segX + 1}
                y={y + 1}
                width={segmentWidth - 2}
                height={barHeight - 2}
                rx={3}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={1}
              >
                <animate
                  attributeName="opacity"
                  values="0.8;0.3;0.8"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              </rect>
            )}
          </g>
        )
      })}

      {/* Connector dots between phases */}
      {phases.slice(0, -1).map((_, i) => {
        const dotX = padding + (i + 1) * segmentWidth
        return (
          <circle
            key={i}
            cx={dotX}
            cy={y + barHeight / 2}
            r={2}
            fill="#6366f1"
            opacity={0.6}
          />
        )
      })}
    </g>
  )
}
