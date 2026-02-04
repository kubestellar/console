/**
 * EPP Routing Visualization
 *
 * Sankey-style diagram showing request distribution through EPP
 * with animated flow particles and routing percentages.
 */
import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Zap, ArrowRight } from 'lucide-react'
import { generateRoutingStats } from '../../../lib/llmd/mockData'

interface FlowNode {
  id: string
  label: string
  x: number
  y: number
  type: 'source' | 'router' | 'prefill' | 'decode'
  color: string
}

interface FlowLink {
  source: string
  target: string
  value: number
  percentage: number
  type: 'prefill' | 'decode' | 'kv-transfer'
}

// Node layout
const NODES: FlowNode[] = [
  { id: 'requests', label: 'Incoming\nRequests', x: 5, y: 50, type: 'source', color: '#3b82f6' },
  { id: 'epp', label: 'EPP\nScheduler', x: 30, y: 50, type: 'router', color: '#f59e0b' },
  { id: 'prefill-0', label: 'Prefill-0', x: 60, y: 15, type: 'prefill', color: '#9333ea' },
  { id: 'prefill-1', label: 'Prefill-1', x: 60, y: 40, type: 'prefill', color: '#9333ea' },
  { id: 'prefill-2', label: 'Prefill-2', x: 60, y: 65, type: 'prefill', color: '#9333ea' },
  { id: 'decode-0', label: 'Decode-0', x: 60, y: 85, type: 'decode', color: '#22c55e' },
  { id: 'decode-1', label: 'Decode-1', x: 85, y: 50, type: 'decode', color: '#22c55e' },
]

// Flow particle component
interface FlowParticleProps {
  link: FlowLink
  delay: number
}

function FlowParticle({ link, delay }: FlowParticleProps) {
  const sourceNode = NODES.find(n => n.id === link.source)
  const targetNode = NODES.find(n => n.id === link.target)

  if (!sourceNode || !targetNode) return null

  const color = link.type === 'prefill' ? '#9333ea' : link.type === 'decode' ? '#22c55e' : '#06b6d4'

  return (
    <motion.circle
      r="3"
      fill={color}
      initial={{ cx: `${sourceNode.x}%`, cy: `${sourceNode.y}%`, opacity: 0 }}
      animate={{
        cx: [`${sourceNode.x}%`, `${targetNode.x}%`],
        cy: [`${sourceNode.y}%`, `${targetNode.y}%`],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration: 2,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
      style={{ filter: `drop-shadow(0 0 4px ${color})` }}
    />
  )
}

// Sankey link path generator
function generateLinkPath(source: FlowNode, target: FlowNode, offset = 0): string {
  const sourceY = source.y + offset
  const targetY = target.y + offset

  const midX = (source.x + target.x) / 2

  return `M ${source.x} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${target.x} ${targetY}`
}

export function EPPRouting() {
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)
  const [showParticles, setShowParticles] = useState(true)

  // Update stats periodically (data ready for future real-time integration)
  useEffect(() => {
    const updateStats = () => {
      // Stats available via generateRoutingStats() when needed
      generateRoutingStats()
    }

    updateStats()
    const interval = setInterval(updateStats, 5000)
    return () => clearInterval(interval)
  }, [])

  // Transform routing stats to flow links
  const links = useMemo((): FlowLink[] => {
    return [
      { source: 'requests', target: 'epp', value: 450, percentage: 100, type: 'prefill' as const },
      { source: 'epp', target: 'prefill-0', value: 120, percentage: 27, type: 'prefill' as const },
      { source: 'epp', target: 'prefill-1', value: 115, percentage: 26, type: 'prefill' as const },
      { source: 'epp', target: 'prefill-2', value: 95, percentage: 21, type: 'prefill' as const },
      { source: 'epp', target: 'decode-0', value: 65, percentage: 14, type: 'decode' as const },
      { source: 'epp', target: 'decode-1', value: 55, percentage: 12, type: 'decode' as const },
      { source: 'prefill-0', target: 'decode-1', value: 60, percentage: 50, type: 'decode' as const },
      { source: 'prefill-1', target: 'decode-1', value: 58, percentage: 50, type: 'decode' as const },
      { source: 'prefill-2', target: 'decode-1', value: 48, percentage: 50, type: 'decode' as const },
    ]
  }, [])

  // Aggregate metrics
  const metrics = useMemo(() => {
    const prefillTotal = links
      .filter(l => l.source === 'epp' && l.target.startsWith('prefill'))
      .reduce((sum, l) => sum + l.value, 0)
    const decodeTotal = links
      .filter(l => l.source === 'epp' && l.target.startsWith('decode'))
      .reduce((sum, l) => sum + l.value, 0)

    return {
      totalRps: 450,
      prefillRps: prefillTotal,
      decodeRps: decodeTotal,
      prefillPercent: Math.round((prefillTotal / 450) * 100),
      decodePercent: Math.round((decodeTotal / 450) * 100),
    }
  }, [links])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-amber-400" />
          <span className="font-medium text-white">EPP Routing</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowParticles(!showParticles)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              showParticles
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-slate-700/50 text-slate-400'
            }`}
          >
            {showParticles ? 'Pause' : 'Animate'}
          </button>
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
            Demo
          </span>
        </div>
      </div>

      {/* Metrics bar */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Total:</span>
          <span className="text-white font-mono">{metrics.totalRps} rps</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-muted-foreground">Prefill:</span>
          <span className="text-purple-400 font-mono">{metrics.prefillPercent}%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-muted-foreground">Decode:</span>
          <span className="text-green-400 font-mono">{metrics.decodePercent}%</span>
        </div>
      </div>

      {/* Sankey diagram */}
      <div className="flex-1 relative">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Gradients for links */}
            <linearGradient id="prefillGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#9333ea" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="decodeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="handoffGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9333ea" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {/* Links */}
          {links.map((link, i) => {
            const source = NODES.find(n => n.id === link.source)
            const target = NODES.find(n => n.id === link.target)
            if (!source || !target) return null

            const linkId = `${link.source}-${link.target}`
            const isHovered = hoveredLink === linkId
            const strokeWidth = Math.max(2, link.percentage / 10)

            const gradient =
              link.source === 'requests' ? 'url(#prefillGradient)' :
              link.source === 'epp' && link.target.startsWith('prefill') ? 'url(#prefillGradient)' :
              link.source === 'epp' && link.target.startsWith('decode') ? 'url(#decodeGradient)' :
              'url(#handoffGradient)'

            return (
              <g key={linkId}>
                {/* Link path */}
                <motion.path
                  d={generateLinkPath(source, target)}
                  fill="none"
                  stroke={gradient}
                  strokeWidth={strokeWidth}
                  opacity={isHovered ? 0.8 : 0.4}
                  onMouseEnter={() => setHoveredLink(linkId)}
                  onMouseLeave={() => setHoveredLink(null)}
                  className="cursor-pointer"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1, delay: i * 0.1 }}
                />

                {/* Percentage label */}
                {link.percentage > 10 && (
                  <text
                    x={`${(source.x + target.x) / 2}%`}
                    y={`${(source.y + target.y) / 2 - 2}%`}
                    textAnchor="middle"
                    fill={isHovered ? '#fff' : '#71717a'}
                    fontSize="7"
                    className="pointer-events-none"
                  >
                    {link.percentage}%
                  </text>
                )}
              </g>
            )
          })}

          {/* Animated particles */}
          {showParticles && links.map((link, i) => (
            <FlowParticle
              key={`particle-${link.source}-${link.target}`}
              link={link}
              delay={i * 0.3}
            />
          ))}

          {/* Nodes */}
          {NODES.map((node, i) => (
            <motion.g
              key={node.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              {/* Node glow */}
              <motion.circle
                cx={`${node.x}%`}
                cy={`${node.y}%`}
                r="8"
                fill="none"
                stroke={node.color}
                strokeWidth="1"
                opacity={0.3}
                animate={{
                  r: [8, 10, 8],
                  opacity: [0.3, 0.5, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                style={{ filter: `drop-shadow(0 0 4px ${node.color})` }}
              />

              {/* Node circle */}
              <circle
                cx={`${node.x}%`}
                cy={`${node.y}%`}
                r="6"
                fill="#1a1a2e"
                stroke={node.color}
                strokeWidth="2"
              />

              {/* Node label */}
              <text
                x={`${node.x}%`}
                y={`${node.y + 10}%`}
                textAnchor="middle"
                fill="#a1a1aa"
                fontSize="6"
              >
                {node.label.split('\n').map((line, j) => (
                  <tspan key={j} x={`${node.x}%`} dy={j === 0 ? 0 : 7}>
                    {line}
                  </tspan>
                ))}
              </text>
            </motion.g>
          ))}
        </svg>
      </div>

      {/* Hovered link details */}
      {hoveredLink && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-16 left-4 right-4 bg-slate-800/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700"
        >
          {(() => {
            const link = links.find(l => `${l.source}-${l.target}` === hoveredLink)
            if (!link) return null

            return (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-white capitalize">{link.source.replace('-', ' ')}</span>
                  <ArrowRight size={14} className="text-muted-foreground" />
                  <span className="text-white capitalize">{link.target.replace('-', ' ')}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    <span className="text-white font-mono">{link.value}</span> rps
                  </span>
                  <span className={`font-mono ${
                    link.type === 'prefill' ? 'text-purple-400' : 'text-green-400'
                  }`}>
                    {link.percentage}%
                  </span>
                </div>
              </div>
            )
          })()}
        </motion.div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-1 bg-gradient-to-r from-amber-500/50 to-purple-500/50 rounded" />
          <span className="text-muted-foreground">Prefill routing</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-1 bg-gradient-to-r from-amber-500/50 to-green-500/50 rounded" />
          <span className="text-muted-foreground">Decode routing</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-1 bg-gradient-to-r from-purple-500/50 to-green-500/50 rounded" />
          <span className="text-muted-foreground">P/D handoff</span>
        </div>
      </div>
    </div>
  )
}

export default EPPRouting
