// ---------------------------------------------------------------------------
// ClusterScopeSection — per-cluster resource kind + namespace picker
// Must be a real component (not rendered inside a loop) so that
// useNamespaces() is called at the top level of a component, not inside a map.
// ---------------------------------------------------------------------------

import { useState, useCallback } from 'react'
import i18next from 'i18next'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useNamespaces } from '../../hooks/mcp/namespaces'
import { ORBIT_CLUSTER_SCOPED_KINDS, ORBIT_NAMESPACED_KINDS } from '../../lib/constants/k8sResources'
import type { OrbitResourceFilter } from '../../lib/missions/types'

export interface ClusterScopeSectionProps {
  clusterName: string
  value: OrbitResourceFilter[]
  onChange: (clusterName: string, filters: OrbitResourceFilter[]) => void
}

export function ClusterScopeSection({ clusterName, value, onChange }: ClusterScopeSectionProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(value.length > 0)
  const { namespaces, isLoading: nsLoading } = useNamespaces(clusterName)
  const nsOptions = (namespaces || []) as string[]

  const isKindChecked = (kind: string) => value.some(f => f.kind === kind)

  const getNamespacesForKind = (kind: string): string[] =>
    value.find(f => f.kind === kind)?.namespaces ?? []

  const toggleKind = useCallback((meta: { kind: string; clusterScoped: boolean }) => {
    if (isKindChecked(meta.kind)) {
      onChange(clusterName, value.filter(f => f.kind !== meta.kind))
    } else {
      onChange(clusterName, [...value, { kind: meta.kind, clusterScoped: meta.clusterScoped, namespaces: [] }])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterName, value, onChange])

  const toggleNamespace = useCallback((kind: string, ns: string) => {
    const existing = value.find(f => f.kind === kind)
    if (!existing) return
    const nsSet = new Set(existing.namespaces ?? [])
    if (nsSet.has(ns)) nsSet.delete(ns)
    else nsSet.add(ns)
    onChange(clusterName, value.map(f => f.kind === kind ? { ...f, namespaces: [...nsSet] } : f))
  }, [clusterName, value, onChange])

  const activeCount = value.length

  // Group kinds by their `group` field for display
  const clusterGroups = ORBIT_CLUSTER_SCOPED_KINDS.reduce<Record<string, typeof ORBIT_CLUSTER_SCOPED_KINDS>>((acc, k) => {
    ;(acc[k.group] ??= []).push(k)
    return acc
  }, {})
  const namespacedGroups = ORBIT_NAMESPACED_KINDS.reduce<Record<string, typeof ORBIT_NAMESPACED_KINDS>>((acc, k) => {
    ;(acc[k.group] ??= []).push(k)
    return acc
  }, {})

  return (
    <div className="mt-1 ml-6 border-l border-border pl-3">
      <button
        onClick={() => setExpanded(p => !p)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-0.5"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span>{i18next.t('common:scope', 'Scope')}</span>
        {activeCount > 0 && (
          <span className="bg-purple-500/20 text-purple-400 px-1 rounded-full">
            {activeCount}
          </span>
        )}
        {activeCount === 0 && <span className="text-[9px] opacity-50">(all resources)</span>}
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {/* Cluster-scoped section */}
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Cluster-scoped</p>
            <div className="space-y-2">
              {Object.entries(clusterGroups).map(([group, kinds]) => (
                <div key={group}>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60 mb-0.5">{group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {kinds.map(k => (
                      <label key={k.kind} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isKindChecked(k.kind)}
                          onChange={() => toggleKind(k)}
                          className="accent-purple-500 w-3 h-3"
                        />
                        <span className={cn(
                          'text-[10px]',
                          isKindChecked(k.kind) ? 'text-foreground' : 'text-muted-foreground',
                        )}>{k.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Namespaced section */}
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Namespaced</p>
            <div className="space-y-2">
              {Object.entries(namespacedGroups).map(([group, kinds]) => (
                <div key={group}>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60 mb-0.5">{group}</p>
                  <div className="space-y-1">
                    {kinds.map(k => (
                      <div key={k.kind}>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isKindChecked(k.kind)}
                            onChange={() => toggleKind(k)}
                            className="accent-purple-500 w-3 h-3"
                          />
                          <span className={cn(
                            'text-[10px]',
                            isKindChecked(k.kind) ? 'text-foreground' : 'text-muted-foreground',
                          )}>{k.label}</span>
                        </label>

                        {/* Namespace picker — only shown when kind is checked */}
                        {isKindChecked(k.kind) && (
                          <div className="ml-4 mt-1">
                            {nsLoading ? (
                              <span className="text-[9px] text-muted-foreground">{t('rbac.loadingNamespaces')}</span>
                            ) : nsOptions.length === 0 ? (
                              <span className="text-[9px] text-muted-foreground">All namespaces</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {nsOptions.map(ns => {
                                  const checked = getNamespacesForKind(k.kind).includes(ns)
                                  return (
                                    <button
                                      key={ns}
                                      onClick={() => toggleNamespace(k.kind, ns)}
                                      className={cn(
                                        'text-[9px] px-1.5 py-0.5 rounded border transition-colors',
                                        checked
                                          ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                                          : 'border-border text-muted-foreground hover:border-purple-500/40',
                                      )}
                                    >
                                      {ns}
                                    </button>
                                  )
                                })}
                                {getNamespacesForKind(k.kind).length === 0 && (
                                  <span className="text-[9px] text-muted-foreground/60 self-center">all namespaces</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// buildScopeString — injects resource filter selections into the orbit prompt
// ---------------------------------------------------------------------------

