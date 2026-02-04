/**
 * LLM-d Flow Visualization
 *
 * Animated request flow diagram showing the full inference pipeline
 * with particle effects, real-time routing, and interactive elements.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Zap, Database, Server, Radio, ArrowRight } from 'lucide-react'
import { generateServerMetrics, type ServerMetrics } from '../../../lib/llmd/mockData'

// Node positions for the flow diagram (relative coordinates 0-100)
const NODE_POSITIONS = {
  client: { x: 5, y: 50 },
  gateway: { x: 20, y: 50 },
  epp: { x: 40, y: 50 },
  prefill0: { x: 60, y: 20 },
  prefill1: { x: 60, y: 50 },
  prefill2: { x: 60, y: 80 },
  decode0: { x: 80, y: 35 },
  decode1: { x: 80, y: 65 },
  kvcache: { x: 70, y: 95 },
}

// Particle representing a request flowing through the system
interface Particle {
  id: string
  path: string[]
  progress: number
  type: 'prefill' | 'decode' | 'kv-transfer'
  speed: number
}

// Connection between nodes
interface Connection {
  from: keyof typeof NODE_POSITIONS
  to: keyof typeof NODE_POSITIONS
  type: 'prefill' | 'decode' | 'kv-transfer'
  trafficPercent: number
}

const CONNECTIONS: Connection[] = [
  { from: 'client', to: 'gateway', type: 'prefill', trafficPercent: 100 },
  { from: 'gateway', to: 'epp', type: 'prefill', trafficPercent: 100 },
  { from: 'epp', to: 'prefill0', type: 'prefill', trafficPercent: 27 },
  { from: 'epp', to: 'prefill1', type: 'prefill', trafficPercent: 26 },
  { from: 'epp', to: 'prefill2', type: 'prefill', trafficPercent: 21 },
  { from: 'epp', to: 'decode0', type: 'decode', trafficPercent: 14 },
  { from: 'epp', to: 'decode1', type: 'decode', trafficPercent: 12 },
  { from: 'prefill0', to: 'decode0', type: 'decode', trafficPercent: 50 },
  { from: 'prefill0', to: 'decode1', type: 'decode', trafficPercent: 50 },
  { from: 'prefill1', to: 'decode0', type: 'decode', trafficPercent: 50 },
  { from: 'prefill1', to: 'decode1', type: 'decode', trafficPercent: 50 },
  { from: 'prefill2', to: 'decode0', type: 'decode', trafficPercent: 50 },
  { from: 'prefill2', to: 'decode1', type: 'decode', trafficPercent: 50 },
  { from: 'prefill0', to: 'kvcache', type: 'kv-transfer', trafficPercent: 100 },
  { from: 'prefill1', to: 'kvcache', type: 'kv-transfer', trafficPercent: 100 },
  { from: 'prefill2', to: 'kvcache', type: 'kv-transfer', trafficPercent: 100 },
  { from: 'kvcache', to: 'decode0', type: 'kv-transfer', trafficPercent: 50 },
  { from: 'kvcache', to: 'decode1', type: 'kv-transfer', trafficPercent: 50 },
]

// Color palette
const COLORS = {
  prefill: '#9333ea', // Purple
  decode: '#22c55e', // Green
  'kv-transfer': '#06b6d4', // Cyan
  gateway: '#3b82f6', // Blue
  epp: '#f59e0b', // Amber
  healthy: '#22c55e',
  degraded: '#f59e0b',
  unhealthy: '#ef4444',
}

interface FlowNodeProps {
  id: keyof typeof NODE_POSITIONS
  label: string
  icon: React.ReactNode
  metrics?: ServerMetrics
  isHighlighted?: boolean
  onClick?: () => void
}

function FlowNode({ id, label, icon, metrics, isHighlighted, onClick }: FlowNodeProps) {
  const pos = NODE_POSITIONS[id]
  const status = metrics?.status || 'healthy'
  const load = metrics?.load || 0

  const statusColor = COLORS[status]
  const glowIntensity = isHighlighted ? 0.8 : load > 70 ? 0.6 : 0.3

  return (
    <motion.g
      className="cursor-pointer"
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      {/* Glow effect */}
      <motion.circle
        cx={`${pos.x}%`}
        cy={`${pos.y}%`}
        r="28"
        fill="none"
        stroke={statusColor}
        strokeWidth="2"
        opacity={glowIntensity}
        animate={{
          opacity: [glowIntensity, glowIntensity * 1.5, glowIntensity],
          r: [28, 32, 28],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{ filter: `drop-shadow(0 0 8px ${statusColor})` }}
      />

      {/* Main node circle */}
      <circle
        cx={`${pos.x}%`}
        cy={`${pos.y}%`}
        r="24"
        fill="#1a1a2e"
        stroke={statusColor}
        strokeWidth="2"
        style={{ filter: `drop-shadow(0 0 4px ${statusColor}40)` }}
      />

      {/* Load indicator arc */}
      {load > 0 && (
        <motion.circle
          cx={`${pos.x}%`}
          cy={`${pos.y}%`}
          r="24"
          fill="none"
          stroke={load > 80 ? '#ef4444' : load > 60 ? '#f59e0b' : '#22c55e'}
          strokeWidth="3"
          strokeDasharray={`${(load / 100) * 150.8} 150.8`}
          strokeLinecap="round"
          transform={`rotate(-90 ${pos.x} ${pos.y})`}
          style={{ transformOrigin: `${pos.x}% ${pos.y}%` }}
          initial={{ strokeDasharray: '0 150.8' }}
          animate={{ strokeDasharray: `${(load / 100) * 150.8} 150.8` }}
          transition={{ duration: 1 }}
        />
      )}

      {/* Icon placeholder (using foreignObject for React icons) */}
      <foreignObject
        x={`${pos.x - 2}%`}
        y={`${pos.y - 2}%`}
        width="4%"
        height="4%"
        style={{ overflow: 'visible' }}
      >
        <div className="flex items-center justify-center w-full h-full text-white">
          {icon}
        </div>
      </foreignObject>

      {/* Label */}
      <text
        x={`${pos.x}%`}
        y={`${pos.y + 6}%`}
        textAnchor="middle"
        fill="#a1a1aa"
        fontSize="10"
        fontWeight="500"
      >
        {label}
      </text>

      {/* Metrics tooltip on hover */}
      {metrics && (
        <text
          x={`${pos.x}%`}
          y={`${pos.y - 5}%`}
          textAnchor="middle"
          fill="#71717a"
          fontSize="8"
        >
          {metrics.throughputRps} rps
        </text>
      )}
    </motion.g>
  )
}

interface FlowConnectionProps {
  connection: Connection
  isAnimating?: boolean
}

function FlowConnection({ connection, isAnimating = true }: FlowConnectionProps) {
  const from = NODE_POSITIONS[connection.from]
  const to = NODE_POSITIONS[connection.to]

  const color = COLORS[connection.type]
  const strokeWidth = Math.max(1, connection.trafficPercent / 20)

  // Calculate control points for curved path
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const curve = Math.abs(from.y - to.y) > 20 ? 10 : 5

  const pathD = `M ${from.x}% ${from.y}% Q ${midX}% ${midY - curve}% ${to.x}% ${to.y}%`

  return (
    <g>
      {/* Background line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={0.2}
      />

      {/* Animated dashed line */}
      {isAnimating && (
        <motion.path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray="4 4"
          opacity={0.6}
          animate={{
            strokeDashoffset: [0, -16],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      )}

      {/* Traffic percentage label */}
      {connection.trafficPercent > 10 && (
        <text
          x={`${midX}%`}
          y={`${midY - 2}%`}
          textAnchor="middle"
          fill={color}
          fontSize="8"
          opacity={0.8}
        >
          {connection.trafficPercent}%
        </text>
      )}
    </g>
  )
}

// Animated particle moving along a path
interface FlowParticleProps {
  particle: Particle
  onComplete: () => void
}

function FlowParticle({ particle, onComplete }: FlowParticleProps) {
  const [pathIndex, setPathIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 1) {
          if (pathIndex < particle.path.length - 2) {
            setPathIndex(i => i + 1)
            return 0
          } else {
            onComplete()
            return prev
          }
        }
        return prev + particle.speed
      })
    }, 16)

    return () => clearInterval(interval)
  }, [pathIndex, particle.path.length, particle.speed, onComplete])

  if (pathIndex >= particle.path.length - 1) return null

  const fromKey = particle.path[pathIndex] as keyof typeof NODE_POSITIONS
  const toKey = particle.path[pathIndex + 1] as keyof typeof NODE_POSITIONS
  const from = NODE_POSITIONS[fromKey]
  const to = NODE_POSITIONS[toKey]

  if (!from || !to) return null

  const x = from.x + (to.x - from.x) * progress
  const y = from.y + (to.y - from.y) * progress

  const color = COLORS[particle.type]

  return (
    <motion.circle
      cx={`${x}%`}
      cy={`${y}%`}
      r="4"
      fill={color}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
      style={{ filter: `drop-shadow(0 0 6px ${color})` }}
    />
  )
}

export function LLMdFlow() {
  const [serverMetrics, setServerMetrics] = useState<ServerMetrics[]>([])
  const [particles, setParticles] = useState<Particle[]>([])
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [isAnimating, setIsAnimating] = useState(true)

  // Update metrics periodically
  useEffect(() => {
    const updateMetrics = () => {
      setServerMetrics(generateServerMetrics())
    }

    updateMetrics()
    const interval = setInterval(updateMetrics, 2000)
    return () => clearInterval(interval)
  }, [])

  // Generate particles for animation
  useEffect(() => {
    if (!isAnimating) return

    const spawnParticle = () => {
      const paths = [
        ['client', 'gateway', 'epp', 'prefill0', 'decode0'],
        ['client', 'gateway', 'epp', 'prefill1', 'decode1'],
        ['client', 'gateway', 'epp', 'prefill2', 'decode0'],
        ['client', 'gateway', 'epp', 'decode0'],
        ['client', 'gateway', 'epp', 'decode1'],
      ]

      const types: Array<'prefill' | 'decode'> = ['prefill', 'prefill', 'prefill', 'decode', 'decode']
      const index = Math.floor(Math.random() * paths.length)

      const newParticle: Particle = {
        id: `particle-${Date.now()}-${Math.random()}`,
        path: paths[index],
        progress: 0,
        type: types[index],
        speed: 0.02 + Math.random() * 0.01,
      }

      setParticles(prev => [...prev.slice(-20), newParticle]) // Keep max 20 particles
    }

    const interval = setInterval(spawnParticle, 300)
    return () => clearInterval(interval)
  }, [isAnimating])

  const removeParticle = useCallback((id: string) => {
    setParticles(prev => prev.filter(p => p.id !== id))
  }, [])

  const getMetricsForNode = (nodeId: string): ServerMetrics | undefined => {
    const nameMap: Record<string, string> = {
      gateway: 'Istio Gateway',
      epp: 'EPP Scheduler',
      prefill0: 'Prefill-0',
      prefill1: 'Prefill-1',
      prefill2: 'Prefill-2',
      decode0: 'Decode-0',
      decode1: 'Decode-1',
      kvcache: 'KV Cache',
    }
    return serverMetrics.find(m => m.name === nameMap[nodeId])
  }

  // Calculate aggregate stats
  const totalThroughput = useMemo(() =>
    serverMetrics
      .filter(m => m.type === 'prefill' || m.type === 'decode')
      .reduce((sum, m) => sum + m.throughputRps, 0),
    [serverMetrics]
  )

  const avgLoad = useMemo(() => {
    const relevant = serverMetrics.filter(m => m.type === 'prefill' || m.type === 'decode')
    return relevant.length > 0
      ? Math.round(relevant.reduce((sum, m) => sum + m.load, 0) / relevant.length)
      : 0
  }, [serverMetrics])

  return (
    <div className="relative w-full h-full min-h-[400px] bg-gradient-to-br from-slate-900/50 to-slate-800/30 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Throughput:</span>
            <span className="text-white font-mono">{totalThroughput} rps</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Avg Load:</span>
            <span className={`font-mono ${avgLoad > 70 ? 'text-amber-400' : 'text-green-400'}`}>
              {avgLoad}%
            </span>
          </div>
        </div>

        <button
          onClick={() => setIsAnimating(!isAnimating)}
          className={`px-3 py-1 rounded text-xs transition-colors ${
            isAnimating
              ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
          }`}
        >
          {isAnimating ? 'Pause' : 'Resume'}
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 text-xs z-10">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.prefill }} />
          <span className="text-muted-foreground">Prefill</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.decode }} />
          <span className="text-muted-foreground">Decode</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS['kv-transfer'] }} />
          <span className="text-muted-foreground">KV Transfer</span>
        </div>
      </div>

      {/* Demo badge */}
      <div className="absolute top-4 right-4 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded z-10">
        Demo Data
      </div>

      {/* SVG Flow Diagram */}
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Connections */}
        {CONNECTIONS.map((conn, i) => (
          <FlowConnection
            key={`${conn.from}-${conn.to}-${i}`}
            connection={conn}
            isAnimating={isAnimating}
          />
        ))}

        {/* Particles */}
        <AnimatePresence>
          {particles.map(particle => (
            <FlowParticle
              key={particle.id}
              particle={particle}
              onComplete={() => removeParticle(particle.id)}
            />
          ))}
        </AnimatePresence>

        {/* Nodes */}
        <FlowNode
          id="client"
          label="Clients"
          icon={<Radio size={14} />}
          isHighlighted={selectedNode === 'client'}
          onClick={() => setSelectedNode(selectedNode === 'client' ? null : 'client')}
        />
        <FlowNode
          id="gateway"
          label="Gateway"
          icon={<Activity size={14} />}
          metrics={getMetricsForNode('gateway')}
          isHighlighted={selectedNode === 'gateway'}
          onClick={() => setSelectedNode(selectedNode === 'gateway' ? null : 'gateway')}
        />
        <FlowNode
          id="epp"
          label="EPP"
          icon={<Zap size={14} />}
          metrics={getMetricsForNode('epp')}
          isHighlighted={selectedNode === 'epp'}
          onClick={() => setSelectedNode(selectedNode === 'epp' ? null : 'epp')}
        />
        <FlowNode
          id="prefill0"
          label="Prefill-0"
          icon={<Server size={14} />}
          metrics={getMetricsForNode('prefill0')}
          isHighlighted={selectedNode === 'prefill0'}
          onClick={() => setSelectedNode(selectedNode === 'prefill0' ? null : 'prefill0')}
        />
        <FlowNode
          id="prefill1"
          label="Prefill-1"
          icon={<Server size={14} />}
          metrics={getMetricsForNode('prefill1')}
          isHighlighted={selectedNode === 'prefill1'}
          onClick={() => setSelectedNode(selectedNode === 'prefill1' ? null : 'prefill1')}
        />
        <FlowNode
          id="prefill2"
          label="Prefill-2"
          icon={<Server size={14} />}
          metrics={getMetricsForNode('prefill2')}
          isHighlighted={selectedNode === 'prefill2'}
          onClick={() => setSelectedNode(selectedNode === 'prefill2' ? null : 'prefill2')}
        />
        <FlowNode
          id="decode0"
          label="Decode-0"
          icon={<ArrowRight size={14} />}
          metrics={getMetricsForNode('decode0')}
          isHighlighted={selectedNode === 'decode0'}
          onClick={() => setSelectedNode(selectedNode === 'decode0' ? null : 'decode0')}
        />
        <FlowNode
          id="decode1"
          label="Decode-1"
          icon={<ArrowRight size={14} />}
          metrics={getMetricsForNode('decode1')}
          isHighlighted={selectedNode === 'decode1'}
          onClick={() => setSelectedNode(selectedNode === 'decode1' ? null : 'decode1')}
        />
        <FlowNode
          id="kvcache"
          label="KV Cache"
          icon={<Database size={14} />}
          metrics={getMetricsForNode('kvcache')}
          isHighlighted={selectedNode === 'kvcache'}
          onClick={() => setSelectedNode(selectedNode === 'kvcache' ? null : 'kvcache')}
        />
      </svg>

      {/* Selected node details panel */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute top-16 right-4 w-56 bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border border-slate-700"
          >
            <h4 className="text-white font-medium mb-2">
              {getMetricsForNode(selectedNode)?.name || selectedNode}
            </h4>
            {getMetricsForNode(selectedNode) && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={`capitalize ${
                    getMetricsForNode(selectedNode)?.status === 'healthy' ? 'text-green-400' :
                    getMetricsForNode(selectedNode)?.status === 'degraded' ? 'text-amber-400' :
                    'text-red-400'
                  }`}>
                    {getMetricsForNode(selectedNode)?.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Load</span>
                  <span className="text-white">{getMetricsForNode(selectedNode)?.load}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Queue</span>
                  <span className="text-white">{getMetricsForNode(selectedNode)?.queueDepth}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Throughput</span>
                  <span className="text-white">{getMetricsForNode(selectedNode)?.throughputRps} rps</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Connections</span>
                  <span className="text-white">{getMetricsForNode(selectedNode)?.activeConnections}</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default LLMdFlow
