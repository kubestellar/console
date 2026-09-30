/**
 * Node list rendering (roving-tabindex keynav rows + expanded detail) for
 * ProactiveGPUNodeHealthMonitor.
 *
 * Extracted from ProactiveGPUNodeHealthMonitor.tsx to keep the main
 * component focused on data orchestration and control rendering.
 */
import { AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../ui/ClusterBadge'
import type { GPUNodeHealthStatus, GPUNodeHealthCheck } from '../../hooks/useMCP'
import { StatusBadge, CheckRow, GPUNodeAIActions } from './ProactiveGPUNodeHealthMonitor.StatusPanels'

interface NodeListPanelProps {
  nodes: GPUNodeHealthStatus[]
  expandedNode: string | null
  setExpandedNode: (key: string | null) => void
  drillToNode: (cluster: string, nodeName: string, extra?: { issue?: string }) => void
}

export function NodeListPanel({ nodes, expandedNode, setExpandedNode, drillToNode }: NodeListPanelProps) {
  const { t } = useTranslation(['common', 'cards'])

  /* Issue 8883: roving-tabindex keynav on each node row — Enter/Space
   * toggles expand; ArrowUp/Down move focus between sibling rows;
   * Home/End jump to ends. Container gets role="list".
   */
  return (
    <div role="group" aria-label="GPU nodes" className="flex-1 overflow-auto space-y-1">
      {nodes.map((node, idx, arr) => {
        const isExpanded = expandedNode === `${node.cluster}/${node.nodeName}`
        const nodeKey = `${node.cluster}/${node.nodeName}`
        const toggleExpand = () => setExpandedNode(isExpanded ? null : nodeKey)
        const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
          const list = e.currentTarget.closest('[role="group"]')
          const items = list ? Array.from(list.querySelectorAll<HTMLDivElement>('[data-keynav-item="gpu-node"]')) : []
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleExpand()
          } else if (e.key === 'ArrowDown' && idx < arr.length - 1) {
            e.preventDefault()
            items[idx + 1]?.focus()
          } else if (e.key === 'ArrowUp' && idx > 0) {
            e.preventDefault()
            items[idx - 1]?.focus()
          } else if (e.key === 'Home') {
            e.preventDefault()
            items[0]?.focus()
          } else if (e.key === 'End') {
            e.preventDefault()
            items[items.length - 1]?.focus()
          }
        }
        return (
          <div key={nodeKey} className="rounded-lg border border-border bg-secondary overflow-hidden">
            {/* Node row */}
            <div
              data-keynav-item="gpu-node"
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              aria-label={t('common:actions.toggleGPUNodeAria', { node: node.nodeName })}
              className="group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-secondary transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400"
              onClick={toggleExpand}
              onKeyDown={handleRowKeyDown}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />
              )}
              <StatusBadge status={node.status} />
              <span className="text-xs text-white/90 font-mono truncate flex-1">{node.nodeName}</span>
              <ClusterBadge cluster={node.cluster} size="sm" />
              <span className="text-2xs text-white/40 whitespace-nowrap">
                {node.gpuCount} GPU{node.gpuCount !== 1 ? 's' : ''}
              </span>
              <GPUNodeAIActions node={node} />
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-border px-4 py-2 bg-foreground/1">
                {/* GPU type */}
                <div className="text-xs text-white/50 mb-2">{node.gpuType}</div>

                {/* Health checks */}
                <div className="space-y-0.5">
                  {(node.checks || []).map((check: GPUNodeHealthCheck) => (
                    <CheckRow key={check.name} check={check} />
                  ))}
                </div>

                {/* Issues summary */}
                {(node.issues || []).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <div className="text-2xs text-white/40 uppercase tracking-wider mb-1">{t('cards:gpuNodeHealth.issues')}</div>
                    {(node.issues || []).map((issue: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-red-300/80 py-0.5">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-red-400/60" />
                        {issue}
                      </div>
                    ))}
                  </div>
                )}

                {/* Drill down button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    drillToNode(node.cluster, node.nodeName, { issue: (node.issues || [])[0] })
                  }}
                  className="mt-2 px-3 py-1 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded text-muted-foreground hover:text-foreground/80 transition-colors"
                >
                  {t('cards:gpuNodeHealth.viewNodeDetails')}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
