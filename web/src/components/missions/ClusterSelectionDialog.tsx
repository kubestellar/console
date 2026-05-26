/**
 * ClusterSelectionDialog — Prompts the user to select target clusters
 * before running an install-type mission.
 * Supports multi-select, select all, invert, and deselect.
 */

import { useState, useEffect } from 'react'
import { Server, Check, CheckCheck, RefreshCw, Search, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals/BaseModal'
import { useClusters } from '../../hooks/mcp/clusters'
import type { ClusterInfo } from '../../hooks/mcp/types'
import { Button } from '../ui/Button'

/** Delay before auto-selecting a single online cluster (ms) */
const AUTO_SELECT_DELAY_MS = 600
/** Show search only when enough clusters are present to need filtering. */
const SEARCHABLE_CLUSTER_THRESHOLD = 5

interface ClusterSelectionDialogProps {
  open: boolean
  missionTitle: string
  onSelect: (clusters: string[]) => void
  onCancel: () => void
}

interface ClusterOption {
  id: string
  name: string
  context: string
}

function normalizeClusterField(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toClusterOption(cluster: ClusterInfo): ClusterOption | null {
  const name = normalizeClusterField(cluster.name)
  const context = normalizeClusterField(cluster.context)
  const id = context || name
  if (!id) {
    return null
  }

  return {
    id,
    name: name || context,
    context,
  }
}

function matchesClusterSearch(cluster: ClusterOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  return cluster.name.toLowerCase().includes(normalizedQuery) || cluster.context.toLowerCase().includes(normalizedQuery)
}

export function ClusterSelectionDialog({ open, missionTitle, onSelect, onCancel }: ClusterSelectionDialogProps) {
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, isLoading, refetch } = useClusters()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const onlineClusters = (clusters || []).filter(c => c.reachable !== false && c.healthy !== false)
  const offlineClusters = (clusters || []).filter(c => c.reachable === false || c.healthy === false)
  const searchableOnlineClusters = onlineClusters
    .map(toClusterOption)
    .filter((cluster): cluster is ClusterOption => cluster !== null)
  const searchableOfflineClusters = offlineClusters
    .map(toClusterOption)
    .filter((cluster): cluster is ClusterOption => cluster !== null)
  const invalidClusterCount = onlineClusters.length + offlineClusters.length - searchableOnlineClusters.length - searchableOfflineClusters.length

  const filteredOnline = searchableOnlineClusters.filter(cluster => matchesClusterSearch(cluster, search))
  const filteredOffline = searchableOfflineClusters.filter(cluster => matchesClusterSearch(cluster, search))
  const hasSearchResults = filteredOnline.length + filteredOffline.length > 0

  useEffect(() => {
    if (open && searchableOnlineClusters.length === 1 && selected.size === 0) {
      const timer = setTimeout(() => {
        if (!open) return
        onSelect([searchableOnlineClusters[0].id])
      }, AUTO_SELECT_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [open, searchableOnlineClusters, selected.size, onSelect])

  const toggleCluster = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(searchableOnlineClusters.map(cluster => cluster.id)))
  }

  const deselectAll = () => {
    setSelected(new Set())
  }

  const invertSelection = () => {
    const allIds = searchableOnlineClusters.map(cluster => cluster.id)
    setSelected(prev => new Set(allIds.filter(id => !prev.has(id))))
  }

  const allSelected = searchableOnlineClusters.length > 0 && selected.size === searchableOnlineClusters.length

  return (
    <BaseModal isOpen={open} onClose={onCancel} size="md">
      <BaseModal.Header title={t('missions.browser.clusterSelection.title')} description={missionTitle} icon={Server} onClose={onCancel} />

      <BaseModal.Content noPadding>
        {searchableOnlineClusters.length > SEARCHABLE_CLUSTER_THRESHOLD && (
          <div className="px-3 pt-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('missions.browser.clusterSelection.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 px-3 pt-2 shrink-0">
          <button
            onClick={allSelected ? deselectAll : selectAll}
            className="flex items-center gap-1 px-2 py-1 text-2xs text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
          >
            <CheckCheck className="w-3 h-3" />
            {allSelected ? t('missions.browser.clusterSelection.deselectAll') : t('missions.browser.clusterSelection.selectAll')}
          </button>
          <button
            onClick={invertSelection}
            className="flex items-center gap-1 px-2 py-1 text-2xs text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {t('missions.browser.clusterSelection.invert')}
          </button>
          {selected.size > 0 && (
            <span className="ml-auto text-2xs text-purple-400">{t('missions.browser.clusterSelection.selected', { count: selected.size })}</span>
          )}
        </div>

        {invalidClusterCount > 0 && (
          <div className="mx-3 mt-3 flex items-start justify-between gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
            <div className="flex items-start gap-2 text-xs text-yellow-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
              <span>{t('missions.browser.clusterSelection.invalidClusterData', { count: invalidClusterCount })}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="shrink-0">
              {t('common.retry')}
            </Button>
          </div>
        )}

        <div className="p-3 flex-1 overflow-y-auto scroll-enhanced space-y-1">
          {isLoading && (
            <p className="text-xs text-muted-foreground text-center py-4">{t('missions.browser.clusterSelection.loading')}</p>
          )}

          {!isLoading && searchableOnlineClusters.length === 0 && invalidClusterCount === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">{t('missions.browser.clusterSelection.noOnlineClusters')}</p>
          )}

          {!isLoading && search.trim() && !hasSearchResults && (searchableOnlineClusters.length + searchableOfflineClusters.length) > 0 && (
            <div className="rounded-lg border border-border bg-secondary/30 px-4 py-5 text-center">
              <p className="text-sm font-medium text-foreground">{t('missions.browser.clusterSelection.searchNoResults')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('missions.browser.clusterSelection.searchNoResultsHint')}</p>
            </div>
          )}

          {filteredOnline.map(cluster => {
            const isSelected = selected.has(cluster.id)
            return (
              <button
                key={cluster.id}
                onClick={() => toggleCluster(cluster.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all',
                  isSelected
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-border hover:border-purple-500/30 bg-secondary/30 hover:bg-secondary/50'
                )}
              >
                <div className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                  isSelected ? 'bg-purple-500 border-purple-500' : 'border-muted-foreground/40'
                )}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className="relative shrink-0">
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

          {filteredOffline.map(cluster => (
            <div
              key={cluster.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50 opacity-40 cursor-not-allowed"
            >
              <div className="w-4 h-4 rounded border border-muted-foreground/20 shrink-0" />
              <div className="relative shrink-0">
                <Server className="w-4 h-4 text-muted-foreground" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-1 ring-card" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground truncate">{cluster.name}</p>
                {cluster.context !== cluster.name && cluster.context && (
                  <p className="text-2xs text-muted-foreground truncate">{cluster.context}</p>
                )}
                <p className="text-2xs text-red-400">{t('missions.browser.clusterSelection.offline')}</p>
              </div>
            </div>
          ))}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelect([])}
        >
          {t('missions.browser.clusterSelection.skip')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={() => onSelect(Array.from(selected))}
          disabled={selected.size === 0}
          className="ml-auto"
        >
          {t('missions.browser.clusterSelection.runOnClusters', { count: selected.size || 0 })}
        </Button>
      </BaseModal.Footer>
    </BaseModal>
  )
}
