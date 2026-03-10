/**
 * ClusterSelectionDialog — Prompts the user to select a target cluster
 * before running an install-type mission.
 */

import { useState, useEffect } from 'react'
import { X, Server, Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useClusters } from '../../hooks/mcp/clusters'
import { Button } from '../ui/Button'

/** Delay before auto-selecting a single online cluster (ms) */
const AUTO_SELECT_DELAY_MS = 600

interface ClusterSelectionDialogProps {
  open: boolean
  missionTitle: string
  onSelect: (cluster: string) => void
  onCancel: () => void
}

export function ClusterSelectionDialog({ open, missionTitle, onSelect, onCancel }: ClusterSelectionDialogProps) {
  const { clusters, isLoading } = useClusters()
  const [selected, setSelected] = useState<string | null>(null)

  // Filter to reachable/healthy clusters
  const onlineClusters = (clusters || []).filter(c => c.reachable !== false && c.healthy !== false)
  const offlineClusters = (clusters || []).filter(c => c.reachable === false || c.healthy === false)

  // Auto-select if only one online cluster
  useEffect(() => {
    if (onlineClusters.length === 1 && !selected) {
      const timer = setTimeout(() => {
        onSelect(onlineClusters[0].context || onlineClusters[0].name)
      }, AUTO_SELECT_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [onlineClusters, selected, onSelect])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xl">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Select Target Cluster</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[320px]">{missionTitle}</p>
          </div>
          <Button variant="ghost" onClick={onCancel} className="p-1 rounded-md min-h-11 min-w-11" icon={<X className="w-4 h-4" />} />
        </div>

        {/* Cluster list */}
        <div className="p-3 max-h-64 overflow-y-auto space-y-1.5">
          {isLoading && (
            <p className="text-xs text-muted-foreground text-center py-4">Loading clusters...</p>
          )}

          {!isLoading && onlineClusters.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No online clusters found</p>
          )}

          {onlineClusters.map(cluster => {
            const id = cluster.context || cluster.name
            const isSelected = selected === id
            return (
              <button
                key={id}
                onClick={() => setSelected(id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
                  isSelected
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-border hover:border-purple-500/30 bg-secondary/30 hover:bg-secondary/50'
                )}
              >
                <div className="relative flex-shrink-0">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 ring-1 ring-card" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{cluster.name}</p>
                  {cluster.context !== cluster.name && cluster.context && (
                    <p className="text-2xs text-muted-foreground truncate">{cluster.context}</p>
                  )}
                </div>
                {isSelected && <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />}
              </button>
            )
          })}

          {/* Show offline clusters as disabled */}
          {offlineClusters.map(cluster => {
            const id = cluster.context || cluster.name
            return (
              <div
                key={id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/50 opacity-40 cursor-not-allowed"
              >
                <div className="relative flex-shrink-0">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-1 ring-card" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground truncate">{cluster.name}</p>
                  <p className="text-2xs text-red-400">Offline</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect('')}
          >
            Skip (use current context)
          </Button>
          <button
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
            className="px-4 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Run Mission
          </button>
        </div>
      </div>
    </div>
  )
}
