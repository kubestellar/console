/**
 * ClusterSelectionDialog — Prompts the user to select target clusters
 * before running an install-type mission.
 * Supports multi-select, select all, invert, and deselect.
 */

import { useState, useEffect } from 'react'
import { Server, Check, CheckCheck, RefreshCw, Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals/BaseModal'
import { useClusters } from '../../hooks/mcp/clusters'
import { Button } from '../ui/Button'

/** Delay before auto-selecting a single online cluster (ms) */
const AUTO_SELECT_DELAY_MS = 600

interface ClusterSelectionDialogProps {
  open: boolean
  missionTitle: string
  onSelect: (clusters: string[]) => void
  onCancel: () => void
}

export function ClusterSelectionDialog({ open, missionTitle, onSelect, onCancel }: ClusterSelectionDialogProps) {
  const { clusters, isLoading } = useClusters()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  // Filter to reachable/healthy clusters
  const onlineClusters = (clusters || []).filter(c => c.reachable !== false && c.healthy !== false)
  const offlineClusters = (clusters || []).filter(c => c.reachable === false || c.healthy === false)

  // Search filtering
  const filteredOnline = (() => {
    if (!search.trim()) return onlineClusters
    const q = search.toLowerCase()
    return onlineClusters.filter(c => c.name.toLowerCase().includes(q) || (c.context && c.context.toLowerCase().includes(q)))
  })()

  const filteredOffline = (() => {
    if (!search.trim()) return offlineClusters
    const q = search.toLowerCase()
    return offlineClusters.filter(c => c.name.toLowerCase().includes(q) || (c.context && c.context.toLowerCase().includes(q)))
  })()

  // Auto-select if only one online cluster
  useEffect(() => {
    if (onlineClusters.length === 1 && selected.size === 0) {
      const timer = setTimeout(() => {
        onSelect([onlineClusters[0].context || onlineClusters[0].name])
      }, AUTO_SELECT_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [onlineClusters, selected.size, onSelect])

  const toggleCluster = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(onlineClusters.map(c => c.context || c.name)))
  }

  const deselectAll = () => {
    setSelected(new Set())
  }

  const invertSelection = () => {
    const allIds = onlineClusters.map(c => c.context || c.name)
    setSelected(prev => new Set(allIds.filter(id => !prev.has(id))))
  }

  const allSelected = onlineClusters.length > 0 && selected.size === onlineClusters.length

  return (
    <BaseModal isOpen={open} onClose={onCancel} size="md">
      <BaseModal.Header title="Select Target Clusters" description={missionTitle} icon={Server} onClose={onCancel} />

      <BaseModal.Content noPadding>
        {/* Search + bulk actions */}
        {onlineClusters.length > 5 && (
          <div className="px-3 pt-3 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search clusters..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 px-3 pt-2 flex-shrink-0">
          <button
            onClick={allSelected ? deselectAll : selectAll}
            className="flex items-center gap-1 px-2 py-1 text-2xs text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
          >
            <CheckCheck className="w-3 h-3" />
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <button
            onClick={invertSelection}
            className="flex items-center gap-1 px-2 py-1 text-2xs text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Invert
          </button>
          {selected.size > 0 && (
            <span className="ml-auto text-2xs text-purple-400">{selected.size} selected</span>
          )}
        </div>

        {/* Cluster list */}
        <div className="p-3 flex-1 overflow-y-auto scroll-enhanced space-y-1">
          {isLoading && (
            <p className="text-xs text-muted-foreground text-center py-4">Loading clusters...</p>
          )}

          {!isLoading && onlineClusters.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No online clusters found</p>
          )}

          {filteredOnline.map(cluster => {
            const id = cluster.context || cluster.name
            const isSelected = selected.has(id)
            return (
              <button
                key={id}
                onClick={() => toggleCluster(id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all',
                  isSelected
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-border hover:border-purple-500/30 bg-secondary/30 hover:bg-secondary/50'
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                  isSelected ? "bg-purple-500 border-purple-500" : "border-muted-foreground/40"
                )}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
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
              </button>
            )
          })}

          {/* Show offline clusters as disabled */}
          {filteredOffline.map(cluster => {
            const id = cluster.context || cluster.name
            return (
              <div
                key={id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50 opacity-40 cursor-not-allowed"
              >
                <div className="w-4 h-4 rounded border border-muted-foreground/20 flex-shrink-0" />
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
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelect([])}
        >
          Skip (use current context)
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={() => onSelect(Array.from(selected))}
          disabled={selected.size === 0}
          className="ml-auto"
        >
          Run on {selected.size || '...'} cluster{selected.size !== 1 ? 's' : ''}
        </Button>
      </BaseModal.Footer>
    </BaseModal>
  )
}
