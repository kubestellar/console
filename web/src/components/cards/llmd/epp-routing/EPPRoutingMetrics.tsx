import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CSSProperties } from 'react'
import type {
  FlowLink,
  FlowNode,
  MetricType,
  NodeMetric,
  NodeMetricHistory,
  ViewMode,
} from './useEPPRoutingData'
import { Sparkline } from './EPPRoutingMetrics.Sparkline'
import { PremiumNode, HorseshoeNode, FlowParticle } from './EPPRoutingMetrics.nodes'

const EPPROUTING_SVG_STYLE_1: CSSProperties = { overflow: 'visible' }
const EPPROUTING_DIV_STYLE_3: CSSProperties = { boxShadow: '0 0 4px rgba(147,51,234,0.4)' }
const EPPROUTING_DIV_STYLE_4: CSSProperties = { boxShadow: '0 0 4px rgba(34,197,94,0.4)' }

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
