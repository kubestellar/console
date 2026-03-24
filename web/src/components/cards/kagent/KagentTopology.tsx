import { useMemo } from 'react'
import { Bot, Wrench, Cpu } from 'lucide-react'
import { useKagentCRDAgents, useKagentCRDTools, useKagentCRDModels } from '../../../hooks/mcp/kagent_crds'
import { useCardLoadingState } from '../CardDataContext'
import { useTranslation } from 'react-i18next'

const RUNTIME_COLORS: Record<string, string> = {
  python: '#60a5fa',
  go: '#34d399',
  byo: '#9ca3af',
  '': '#9ca3af',
}

interface TopoNode {
  id: string
  label: string
  type: 'agent' | 'tool' | 'model'
  cluster: string
  color: string
  x: number
  y: number
}

interface TopoEdge {
  from: string
  to: string
  type: 'agent-tool' | 'agent-model'
}

export function KagentTopology({ config }: { config?: Record<string, unknown> }) {
  const { t: _t } = useTranslation()
  const cluster = config?.cluster as string | undefined
  const { data: agents, isLoading: agentsLoading, isDemoFallback: agentsDemo } = useKagentCRDAgents({ cluster })
  const { data: tools, isLoading: toolsLoading, isDemoFallback: toolsDemo } = useKagentCRDTools({ cluster })
  const { data: models, isLoading: modelsLoading, isDemoFallback: modelsDemo } = useKagentCRDModels({ cluster })

  const hasData = agents.length > 0 || tools.length > 0 || models.length > 0
  useCardLoadingState({
    isLoading: (agentsLoading || toolsLoading || modelsLoading) && !hasData,
    hasAnyData: hasData,
    isDemoData: agentsDemo || toolsDemo || modelsDemo,
  })

  const { nodes, edges } = useMemo(() => {
    const nodesArr: TopoNode[] = []
    const edgesArr: TopoEdge[] = []

    // Collect all clusters
    const clusterSet = new Set([
      ...agents.map(a => a.cluster),
      ...tools.map(t => t.cluster),
      ...models.map(m => m.cluster),
    ])
    const clusters = Array.from(clusterSet)

    const leftX = 60
    const midX = 240
    const rightX = 420
    const rowHeight = 45
    let yOffset = 40

    clusters.forEach(cl => {
      const clAgents = agents.filter(a => a.cluster === cl)
      const clTools = tools.filter(t => t.cluster === cl)
      const clModels = models.filter(m => m.cluster === cl)

      // Place agents on the left
      clAgents.forEach((agent, i) => {
        const id = `agent-${cl}-${agent.name}`
        nodesArr.push({
          id,
          label: agent.name,
          type: 'agent',
          cluster: cl,
          color: RUNTIME_COLORS[agent.runtime] || RUNTIME_COLORS[''],
          x: leftX,
          y: yOffset + i * rowHeight,
        })

        // Agent -> ToolServer edges (co-located tools when agent has toolCount > 0)
        if (agent.toolCount > 0) {
          clTools.forEach(tool => {
            edgesArr.push({ from: id, to: `tool-${cl}-${tool.name}`, type: 'agent-tool' })
          })
        }

        // Agent -> ModelConfig edges (based on modelConfigRef)
        if (agent.modelConfigRef) {
          const matchedModel = clModels.find(m => m.name === agent.modelConfigRef)
          if (matchedModel) {
            edgesArr.push({ from: id, to: `model-${cl}-${matchedModel.name}`, type: 'agent-model' })
          }
        }
      })

      // Place tool servers in the middle
      clTools.forEach((tool, i) => {
        nodesArr.push({
          id: `tool-${cl}-${tool.name}`,
          label: tool.name,
          type: 'tool',
          cluster: cl,
          color: '#06b6d4',
          x: midX,
          y: yOffset + i * rowHeight,
        })
      })

      // Place models on the right
      clModels.forEach((model, i) => {
        nodesArr.push({
          id: `model-${cl}-${model.name}`,
          label: model.name,
          type: 'model',
          cluster: cl,
          color: '#10b981',
          x: rightX,
          y: yOffset + i * rowHeight,
        })
      })

      yOffset += Math.max(clAgents.length, clTools.length, clModels.length, 1) * rowHeight + 30
    })

    return { nodes: nodesArr, edges: edgesArr }
  }, [agents, tools, models])

  if (agentsLoading || toolsLoading || modelsLoading) {
    return (
      <div className="h-full flex flex-col min-h-card p-4 animate-pulse">
        <div className="flex-1 bg-secondary rounded-lg" />
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-card items-center justify-center text-muted-foreground text-xs">
        No agents, tools, or models found
      </div>
    )
  }

  const svgHeight = Math.max(200, nodes.reduce((max, n) => Math.max(max, n.y + 40), 0))

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Legend */}
      <div className="flex items-center gap-4 px-3 pt-2 pb-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full border-2 border-blue-400" />
          <span>Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded bg-cyan-500/50" />
          <span>ToolServer</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded bg-emerald-500/50" />
          <span>Model</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-6 h-0 border-t border-dashed border-muted-foreground/50" />
          <span>Link</span>
        </div>
      </div>

      {/* SVG graph */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        <svg width="100%" height={svgHeight} viewBox={`0 0 500 ${svgHeight}`} className="w-full" style={{ fontFamily: 'var(--font-family)' }}>
          {/* Edges */}
          {edges.map((edge, i) => {
            const from = nodes.find(n => n.id === edge.from)
            const to = nodes.find(n => n.id === edge.to)
            if (!from || !to) return null
            const strokeColor = edge.type === 'agent-tool' ? '#06b6d4' : '#10b981'
            return (
              <line
                key={i}
                x1={from.x + 12}
                y1={from.y}
                x2={to.x - 12}
                y2={to.y}
                stroke={strokeColor}
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.4}
              />
            )
          })}

          {/* Nodes */}
          {nodes.map(node => (
            <g key={node.id}>
              {node.type === 'agent' ? (
                <>
                  <circle cx={node.x} cy={node.y} r={14} fill={node.color} opacity={0.15} />
                  <circle cx={node.x} cy={node.y} r={10} fill="none" stroke={node.color} strokeWidth={2} />
                  <Bot x={node.x - 5} y={node.y - 5} width={10} height={10} className="text-white" />
                </>
              ) : node.type === 'tool' ? (
                <>
                  <rect x={node.x - 12} y={node.y - 12} width={24} height={24} rx={4} fill={node.color} opacity={0.15} />
                  <rect x={node.x - 9} y={node.y - 9} width={18} height={18} rx={3} fill="none" stroke={node.color} strokeWidth={1.5} />
                  <Wrench x={node.x - 5} y={node.y - 5} width={10} height={10} className="text-cyan-400" />
                </>
              ) : (
                <>
                  <rect x={node.x - 12} y={node.y - 12} width={24} height={24} rx={12} fill={node.color} opacity={0.15} />
                  <rect x={node.x - 9} y={node.y - 9} width={18} height={18} rx={9} fill="none" stroke={node.color} strokeWidth={1.5} />
                  <Cpu x={node.x - 5} y={node.y - 5} width={10} height={10} className="text-emerald-400" />
                </>
              )}
              <text
                x={node.type === 'agent' ? node.x - 50 : node.type === 'model' ? node.x + 20 : node.x}
                y={node.type === 'tool' ? node.y + 25 : node.y + 4}
                fill="currentColor"
                fontSize={11}
                textAnchor={node.type === 'agent' ? 'end' : node.type === 'model' ? 'start' : 'middle'}
                className="select-none text-muted-foreground"
              >
                {node.label.length > 16 ? node.label.slice(0, 14) + '...' : node.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
