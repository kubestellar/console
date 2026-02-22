import { useMemo } from 'react'
import { Bot, Wrench } from 'lucide-react'
import { useKagentiAgents, useKagentiTools, type KagentiAgent, type KagentiTool } from '../../../hooks/mcp/kagenti'
import { useCardLoadingState } from '../CardDataContext'
import { useTranslation } from 'react-i18next'

const FRAMEWORK_COLORS: Record<string, string> = {
  langgraph: '#60a5fa',
  crewai: '#34d399',
  ag2: '#fb923c',
  generic: '#9ca3af',
}

interface TopoNode {
  id: string
  label: string
  type: 'agent' | 'tool'
  cluster: string
  color: string
  x: number
  y: number
}

interface TopoEdge {
  from: string
  to: string
}

export function KagentiTopology({ config }: { config?: Record<string, unknown> }) {
  const { t: _t } = useTranslation()
  const cluster = config?.cluster as string | undefined
  const { data: agents, isLoading: agentsLoading } = useKagentiAgents({ cluster })
  const { data: tools, isLoading: toolsLoading } = useKagentiTools({ cluster })

  useCardLoadingState({
    isLoading: agentsLoading || toolsLoading,
    hasAnyData: agents.length > 0 || tools.length > 0,
  })

  const { nodes, edges } = useMemo(() => {
    const nodesMap: TopoNode[] = []
    const edgesArr: TopoEdge[] = []

    // Group by cluster
    const clusterSet = new Set([...agents.map((a: KagentiAgent) => a.cluster), ...tools.map((t: KagentiTool) => t.cluster)])
    const clusters = Array.from(clusterSet)

    let yOffset = 40
    clusters.forEach(cl => {
      const clAgents = agents.filter((a: KagentiAgent) => a.cluster === cl)
      const clTools = tools.filter((t: KagentiTool) => t.cluster === cl)

      // Layout agents on the left, tools on the right
      const leftX = 80
      const rightX = 320
      const rowHeight = 50

      clAgents.forEach((agent: KagentiAgent, i: number) => {
        const id = `agent-${cl}-${agent.name}`
        nodesMap.push({
          id,
          label: agent.name,
          type: 'agent',
          cluster: cl,
          color: FRAMEWORK_COLORS[agent.framework] || FRAMEWORK_COLORS.generic,
          x: leftX,
          y: yOffset + i * rowHeight,
        })

        // Connect each agent to co-located tools (simplified topology)
        clTools.forEach((tool: KagentiTool) => {
          edgesArr.push({ from: id, to: `tool-${cl}-${tool.name}` })
        })
      })

      clTools.forEach((tool: KagentiTool, i: number) => {
        nodesMap.push({
          id: `tool-${cl}-${tool.name}`,
          label: tool.toolPrefix || tool.name,
          type: 'tool',
          cluster: cl,
          color: '#6b7280',
          x: rightX,
          y: yOffset + i * rowHeight,
        })
      })

      yOffset += Math.max(clAgents.length, clTools.length) * rowHeight + 30
    })

    return { nodes: nodesMap, edges: edgesArr }
  }, [agents, tools])

  if (agentsLoading || toolsLoading) {
    return (
      <div className="h-full flex flex-col min-h-card p-4 animate-pulse">
        <div className="flex-1 bg-secondary rounded-lg" />
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-card items-center justify-center text-muted-foreground text-xs">
        No agents or tools to visualize
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
          <div className="w-2.5 h-2.5 rounded bg-muted-foreground/50" />
          <span>MCP Tool</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-6 h-0 border-t border-dashed border-muted-foreground/50" />
          <span>Connection</span>
        </div>
      </div>

      {/* SVG graph */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        <svg width="100%" height={svgHeight} viewBox={`0 0 420 ${svgHeight}`} className="w-full" style={{ fontFamily: 'var(--font-family)' }}>
          {/* Edges */}
          {edges.map((edge, i) => {
            const from = nodes.find(n => n.id === edge.from)
            const to = nodes.find(n => n.id === edge.to)
            if (!from || !to) return null
            return (
              <line
                key={i}
                x1={from.x + 12}
                y1={from.y}
                x2={to.x - 12}
                y2={to.y}
                stroke="#4b5563"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.5}
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
              ) : (
                <>
                  <rect x={node.x - 12} y={node.y - 12} width={24} height={24} rx={4} fill={node.color} opacity={0.15} />
                  <rect x={node.x - 9} y={node.y - 9} width={18} height={18} rx={3} fill="none" stroke={node.color} strokeWidth={1.5} />
                  <Wrench x={node.x - 5} y={node.y - 5} width={10} height={10} className="text-gray-400" />
                </>
              )}
              <text
                x={node.type === 'agent' ? node.x - 60 : node.x + 20}
                y={node.y + 4}
                fill="currentColor"
                fontSize={14}
                textAnchor={node.type === 'agent' ? 'end' : 'start'}
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
