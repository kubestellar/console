import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getLoadColors, getHorseshoeColor } from '../shared/colorUtils'
import type { CSSProperties } from 'react'
import type {
  FlowLink,
  FlowNode,
  MetricType,
  NodeMetric,
  NodeMetricHistory,
  ViewMode,
} from './useEPPRoutingData'

const EPPROUTING_SVG_STYLE_1: CSSProperties = { overflow: 'visible' }
const EPPROUTING_DIV_STYLE_3: CSSProperties = { boxShadow: '0 0 4px rgba(147,51,234,0.4)' }
const EPPROUTING_DIV_STYLE_4: CSSProperties = { boxShadow: '0 0 4px rgba(34,197,94,0.4)' }

const NODE_RADIUS = 6
const STROKE_WIDTH = 1.2
const TRACK_WIDTH = 0.8
const PARTICLE_RADIUS = 0.6

function Sparkline({ data, color, width = 80, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  const validData = data.filter(v => Number.isFinite(v))
  if (validData.length < 2) return <div style={{ width, height }} className="bg-secondary/30 rounded" />

  const max = Math.max(...validData, 1)
  const min = Math.min(...validData, 0)
  const range = max - min || 1

  const points = validData.map((value, index) => {
    const x = (index / (validData.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  const areaPath = `M 0,${height} L ${points} L ${width},${height} Z`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`sparkline-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sparkline-fill-${color.replace('#', '')})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 2px ${color})` }}
      />
      <circle
        cx={width}
        cy={height - ((validData[validData.length - 1] - min) / range) * (height - 4) - 2}
        r="2"
        fill={color}
        style={{ filter: `drop-shadow(0 0 2px ${color})` }}
      />
    </svg>
  )
}

interface PremiumNodeProps {
  isSelected?: boolean
  node: FlowNode
  onClick?: () => void
  uniqueId: string
}

function PremiumNode({ node, uniqueId, isSelected, onClick }: PremiumNodeProps) {
  const isGhost = node.isGhost || false
  const load = isGhost ? 0 : (node.load || 0)
  const loadColors = isGhost
    ? { start: '#475569', end: '#64748b', glow: '#475569' }
    : getLoadColors(load)

  const startAngle = -225
  const endAngle = 45
  const totalAngle = endAngle - startAngle
  const valueAngle = startAngle + (load / 100) * totalAngle

  const polarToCartesian = (angle: number, radius: number) => {
    const radians = ((angle - 90) * Math.PI) / 180
    return { x: node.x + radius * Math.cos(radians), y: node.y + radius * Math.sin(radians) }
  }

  const createArc = (radius: number, start: number, end: number) => {
    const startPoint = polarToCartesian(end, radius)
    const endPoint = polarToCartesian(start, radius)
    const largeArc = end - start > 180 ? 1 : 0
    return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArc} 0 ${endPoint.x} ${endPoint.y}`
  }

  const filterIdGlow = `epp-glow-${uniqueId}-${node.id}`
  const gradientId = `epp-gradient-${uniqueId}-${node.id}`
  const innerGlowId = `epp-inner-glow-${uniqueId}-${node.id}`
  const centerGradientId = `epp-center-${uniqueId}-${node.id}`

  return (
    <motion.g
      className="cursor-pointer"
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <defs>
        <filter id={filterIdGlow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.35" result="blur" />
          <feFlood floodColor={loadColors.glow} floodOpacity="0.5" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={loadColors.start} />
          <stop offset="100%" stopColor={loadColors.end} />
        </linearGradient>

        <radialGradient id={innerGlowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={loadColors.glow} stopOpacity="0.2" />
          <stop offset="60%" stopColor={loadColors.glow} stopOpacity="0.08" />
          <stop offset="100%" stopColor={loadColors.glow} stopOpacity="0" />
        </radialGradient>

        <radialGradient id={centerGradientId} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
      </defs>

      {isSelected && (
        <motion.circle
          cx={node.x}
          cy={node.y}
          r={NODE_RADIUS + 1}
          fill="none"
          stroke="#ffffff"
          strokeWidth="0.3"
          opacity={0.6}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS + 0.3}
        fill="none"
        stroke={loadColors.glow}
        strokeWidth="0.2"
        opacity={0.3}
        style={{ filter: 'blur(0.5px)' }}
      />

      <path
        d={createArc(NODE_RADIUS, startAngle, endAngle)}
        fill="none"
        stroke={isGhost ? '#475569' : '#1e293b'}
        strokeWidth={TRACK_WIDTH}
        strokeLinecap="round"
        strokeDasharray={isGhost ? '1 1' : undefined}
        opacity={isGhost ? 0.5 : 0.9}
      />

      {load > 0 && (
        <motion.path
          d={createArc(NODE_RADIUS, startAngle, valueAngle)}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          filter={`url(#${filterIdGlow})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      )}

      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS - 1.5}
        fill={`url(#${centerGradientId})`}
      />

      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS - 1.5}
        fill={`url(#${innerGlowId})`}
      />

      {isGhost ? (
        <g transform={`translate(${node.x - 1.5}, ${node.y - 1.5})`}>
          <rect x="0" y="0" width="1" height="3" fill="#64748b" rx="0.2" />
          <rect x="2" y="0" width="1" height="3" fill="#64748b" rx="0.2" />
        </g>
      ) : load > 0 ? (
        <text
          x={node.x}
          y={node.y + 0.5}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#ffffff"
          fontSize="2.8"
          fontWeight="700"
          style={{ textShadow: `0 0 3px ${loadColors.glow}` }}
        >
          {load}%
        </text>
      ) : null}

      <text
        x={node.x}
        y={node.y + NODE_RADIUS + 3}
        textAnchor="middle"
        fill="#e5e5e5"
        fontSize="2.5"
        fontWeight="600"
      >
        {node.label}
      </text>
    </motion.g>
  )
}

interface FlowParticleProps {
  delay: number
  link: FlowLink
  nodes: FlowNode[]
  pathGenerator: (source: FlowNode, target: FlowNode) => string
}

function FlowParticle({ link, delay, nodes, pathGenerator }: FlowParticleProps) {
  const sourceNode = nodes.find(node => node.id === link.source)
  const targetNode = nodes.find(node => node.id === link.target)

  if (!sourceNode || !targetNode) return null

  const color = link.type === 'prefill' ? '#9333ea' : link.type === 'decode' ? '#22c55e' : '#06b6d4'
  const path = pathGenerator(sourceNode, targetNode)
  const baseDuration = 4 - (link.percentage / 100) * 2.5

  return (
    <circle
      r={PARTICLE_RADIUS}
      fill={color}
      style={{ filter: `drop-shadow(0 0 1.5px ${color})` }}
    >
      <animateMotion
        dur={`${baseDuration}s`}
        repeatCount="indefinite"
        begin={`${delay}s`}
        path={path}
        calcMode="linear"
      />
      <animate
        attributeName="opacity"
        values="0;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0"
        dur={`${baseDuration}s`}
        repeatCount="indefinite"
        begin={`${delay}s`}
      />
    </circle>
  )
}

interface HorseshoeNodeProps {
  isSelected?: boolean
  node: FlowNode
  onClick?: () => void
  uniqueId: string
}

function HorseshoeNode({ node, uniqueId, isSelected, onClick }: HorseshoeNodeProps) {
  const isGhost = node.isGhost || false
  const load = isGhost ? 0 : (node.load || 0)
  const color = isGhost ? '#475569' : getHorseshoeColor(load)
  const filterId = `hs-glow-${uniqueId}-${node.id}`
  const radius = 8
  const strokeWidth = 2.5
  const cx = node.x
  const cy = node.y
  const startAngle = 135
  const endAngle = 45
  const totalSweep = 270
  const valueSweep = (load / 100) * totalSweep
  const valueEndAngle = startAngle + valueSweep

  const toCartesian = (angleDeg: number, r: number) => {
    const radians = (angleDeg * Math.PI) / 180
    return {
      x: cx + r * Math.cos(radians),
      y: cy + r * Math.sin(radians),
    }
  }

  const createArc = (radiusValue: number, fromAngle: number, toAngle: number, sweep: number) => {
    const start = toCartesian(fromAngle, radiusValue)
    const end = toCartesian(toAngle, radiusValue)
    const largeArc = sweep > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radiusValue} ${radiusValue} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  return (
    <motion.g
      className="cursor-pointer"
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feFlood floodColor={color} floodOpacity="0.5" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {isSelected && (
        <motion.circle
          cx={cx}
          cy={cy}
          r={radius + 1.5}
          fill="none"
          stroke="#ffffff"
          strokeWidth="0.3"
          opacity={0.6}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      <path
        d={createArc(radius, startAngle, endAngle, totalSweep)}
        fill="none"
        stroke={isGhost ? '#475569' : '#374151'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={isGhost ? '2 2' : undefined}
        opacity={isGhost ? 0.5 : 1}
      />

      {load > 0 && !isGhost && (
        <motion.path
          d={createArc(radius, startAngle, valueEndAngle, valueSweep)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          filter={`url(#${filterId})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      )}

      <circle
        cx={cx}
        cy={cy}
        r={radius - 3}
        fill="#0f172a"
      />

      {isGhost ? (
        <g transform={`translate(${cx - 2}, ${cy - 2})`}>
          <rect x="0" y="0" width="1.5" height="4" fill="#64748b" rx="0.3" />
          <rect x="2.5" y="0" width="1.5" height="4" fill="#64748b" rx="0.3" />
        </g>
      ) : (
        <text
          x={cx}
          y={cy + 0.5}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#ffffff"
          fontSize="4"
          fontWeight="700"
          style={{ textShadow: `0 0 4px ${color}` }}
        >
          {load}%
        </text>
      )}

      <text
        x={cx}
        y={cy + radius + 4}
        textAnchor="middle"
        fill="#e5e5e5"
        fontSize="2.8"
        fontWeight="600"
      >
        {node.label}
      </text>
    </motion.g>
  )
}

interface EPPRoutingMetricsProps {
  dynamicNodes: FlowNode[]
  generatePath: (source: FlowNode, target: FlowNode) => string
  getNodeWithMetrics: (node: FlowNode) => FlowNode
  hoveredLink: string | null
  isExpanded: boolean
  links: FlowLink[]
  metricsHistory: Record<string, NodeMetricHistory>
  nodeMetrics: Record<string, NodeMetric>
  onHoveredLinkChange: (linkId: string | null) => void
  onSelectedNodeChange: (nodeId: string | null) => void
  selectedMetricTypes: MetricType[]
  selectedNode: string | null
  showEmptyState: boolean
  showParticles: boolean
  toggleMetric: (metric: MetricType) => void
  uniqueId: string
  viewMode: ViewMode
}

export function EPPRoutingMetrics({
  dynamicNodes,
  generatePath,
  getNodeWithMetrics,
  hoveredLink,
  isExpanded,
  links,
  metricsHistory,
  nodeMetrics,
  onHoveredLinkChange,
  onSelectedNodeChange,
  selectedMetricTypes,
  selectedNode,
  showEmptyState,
  showParticles,
  toggleMetric,
  uniqueId,
  viewMode,
}: EPPRoutingMetricsProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <>
      <div className={`flex-1 relative ${isExpanded ? 'min-h-0' : 'min-h-[200px]'}`}>
        {showEmptyState && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-background/60 backdrop-blur-xs rounded-lg">
            <div className="w-12 h-12 rounded-full border-2 border-border border-t-yellow-500 animate-spin mb-4" />
            <span className="text-muted-foreground text-sm">{t('llmd.selectStackRouting')}</span>
            <span className="text-muted-foreground text-xs mt-1">{t('llmd.useStackSelector')}</span>
          </div>
        )}

        <svg
          viewBox={isExpanded ? '-10 -10 240 110' : '-5 -10 120 130'}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="xMidYMid meet"
          style={EPPROUTING_SVG_STYLE_1}
        >
          <defs>
            <linearGradient id={`${uniqueId}-prefillGrad`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#9333ea" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id={`${uniqueId}-decodeGrad`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id={`${uniqueId}-handoffGrad`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9333ea" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          {links.map((link, index) => {
            const source = dynamicNodes.find(node => node.id === link.source)
            const target = dynamicNodes.find(node => node.id === link.target)
            if (!source || !target) return null

            const linkId = `${link.source}-${link.target}`
            const isHovered = hoveredLink === linkId
            const strokeWidth = Math.max(0.3, link.percentage / 35)
            const gradient =
              link.source === 'requests' ? `url(#${uniqueId}-prefillGrad)` :
              link.source === 'epp' && link.target.startsWith('prefill') ? `url(#${uniqueId}-prefillGrad)` :
              link.source === 'epp' && link.target.startsWith('decode') ? `url(#${uniqueId}-decodeGrad)` :
              `url(#${uniqueId}-handoffGrad)`

            return (
              <g key={linkId}>
                <motion.path
                  d={generatePath(source, target)}
                  fill="none"
                  stroke={gradient}
                  strokeWidth={strokeWidth}
                  opacity={isHovered ? 0.7 : 0.35}
                  onMouseEnter={() => onHoveredLinkChange(linkId)}
                  onMouseLeave={() => onHoveredLinkChange(null)}
                  className="cursor-pointer"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, delay: index * 0.08 }}
                />

                {link.source === 'epp' && link.percentage >= 5 && (
                  <text
                    x={(source.x + target.x) / 2}
                    y={(source.y + target.y) / 2 - 2}
                    textAnchor="middle"
                    fill={isHovered ? '#fff' : '#a1a1aa'}
                    fontSize="2.5"
                    fontWeight="500"
                  >
                    {link.percentage}%
                  </text>
                )}
              </g>
            )
          })}

          {showParticles && links.map((link, index) => (
            <FlowParticle
              key={`particle-${link.source}-${link.target}`}
              link={link}
              delay={index * 0.2}
              nodes={dynamicNodes}
              pathGenerator={generatePath}
            />
          ))}

          {viewMode === 'horseshoe' ? (
            dynamicNodes.map(node => (
              <HorseshoeNode
                key={node.id}
                node={getNodeWithMetrics(node)}
                uniqueId={uniqueId}
                isSelected={selectedNode === node.id}
                onClick={() => onSelectedNodeChange(selectedNode === node.id ? null : node.id)}
              />
            ))
          ) : (
            dynamicNodes.map(node => (
              <PremiumNode
                key={node.id}
                node={getNodeWithMetrics(node)}
                uniqueId={uniqueId}
                isSelected={selectedNode === node.id}
                onClick={() => onSelectedNodeChange(selectedNode === node.id ? null : node.id)}
              />
            ))
          )}
        </svg>

        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute left-2 top-2 bg-background/95 backdrop-blur-xs rounded-lg border border-border p-3 shadow-xl max-w-[180px]"
            >
              {(() => {
                const node = dynamicNodes.find(currentNode => currentNode.id === selectedNode)
                const metrics = nodeMetrics[selectedNode]
                const history = metricsHistory[selectedNode]
                if (!node) return null

                return (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
                      <span className="text-white font-medium text-sm">{node.label}</span>
                      <button
                        onClick={(event) => { event.stopPropagation(); onSelectedNodeChange(null) }}
                        className="text-muted-foreground hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="text-xs text-muted-foreground mb-2 capitalize">
                      {node.type === 'router' ? t('llmd.endpointPickerPod') :
                       node.type === 'prefill' ? t('llmd.prefillServer') :
                       node.type === 'decode' ? t('llmd.decodeServer') : t('llmd.source')}
                    </div>

                    {metrics && (
                      <div className="space-y-2">
                        <div className="flex gap-1">
                          {(['load', 'rps'] as MetricType[]).map(metric => (
                            <button
                              key={metric}
                              onClick={(event) => { event.stopPropagation(); toggleMetric(metric) }}
                              className={`px-2 py-0.5 text-xs rounded transition-all ${
                                selectedMetricTypes.includes(metric)
                                  ? metric === 'load'
                                    ? 'bg-yellow-500/20 text-yellow-400 shadow-xs shadow-yellow-500/20'
                                    : 'bg-cyan-500/20 text-cyan-400 shadow-xs shadow-cyan-500/20'
                                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {metric === 'load' ? t('llmd.load') : t('llmd.rps')}
                            </button>
                          ))}
                        </div>

                        <div className="flex gap-3 text-xs">
                          {selectedMetricTypes.includes('load') && (
                            <div>
                              <span className="text-muted-foreground">{t('llmd.load')}:</span>{' '}
                              <span className="text-yellow-400 font-mono">{metrics.load}%</span>
                            </div>
                          )}
                          {selectedMetricTypes.includes('rps') && (
                            <div>
                              <span className="text-muted-foreground">{t('llmd.rps')}:</span>{' '}
                              <span className="text-cyan-400 font-mono">{metrics.rps}</span>
                            </div>
                          )}
                        </div>

                        {history && (
                          <div className={`grid gap-2 ${selectedMetricTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {selectedMetricTypes.includes('load') && (
                              <div>
                                <div className="text-2xs text-yellow-400/70 mb-1">{t('llmd.loadPercent')}</div>
                                <Sparkline
                                  data={history.load}
                                  color="#f59e0b"
                                  width={selectedMetricTypes.length === 2 ? 65 : 140}
                                  height={28}
                                />
                              </div>
                            )}
                            {selectedMetricTypes.includes('rps') && (
                              <div>
                                <div className="text-2xs text-cyan-400/70 mb-1">{t('llmd.rps')}</div>
                                <Sparkline
                                  data={history.rps}
                                  color="#06b6d4"
                                  width={selectedMetricTypes.length === 2 ? 65 : 140}
                                  height={28}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {node.type === 'source' && (
                      <div className="text-xs text-muted-foreground">
                        {t('llmd.incomingRequests')}
                      </div>
                    )}
                  </>
                )
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {hoveredLink && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-background/95 backdrop-blur-xs rounded-lg p-3 border border-border text-xs shadow-xl"
        >
          {(() => {
            const link = links.find(currentLink => `${currentLink.source}-${currentLink.target}` === hoveredLink)
            if (!link) return null

            return (
              <div className="flex flex-wrap items-center justify-between gap-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-white capitalize font-medium">{link.source.replace('-', ' ')}</span>
                  <ArrowRight size={12} className="text-muted-foreground" />
                  <span className="text-white capitalize font-medium">{link.target.replace('-', ' ')}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    <span className="text-white font-mono">{link.value}</span> {t('llmd.rps').toLowerCase()}
                  </span>
                  <span className={`font-mono font-medium ${
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

      <div className="flex items-center justify-center gap-4 mt-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-1 bg-linear-to-r from-yellow-500/60 to-purple-500/60 rounded" style={EPPROUTING_DIV_STYLE_3} />
          <span className="text-muted-foreground">{t('llmd.prefill')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-1 bg-linear-to-r from-yellow-500/60 to-green-500/60 rounded" style={EPPROUTING_DIV_STYLE_4} />
          <span className="text-muted-foreground">{t('llmd.decode')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-1 bg-linear-to-r from-purple-500/60 to-green-500/60 rounded" style={EPPROUTING_DIV_STYLE_4} />
          <span className="text-muted-foreground">{t('llmd.handoff')}</span>
        </div>
      </div>
    </>
  )
}
