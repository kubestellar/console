import { useMemo, useState } from 'react'
import { Check, WifiOff, ChevronRight, CheckCircle, AlertTriangle, HelpCircle, Loader2, ChevronDown, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { ClusterGroup } from '../../hooks/useGlobalFilters'
import { deduplicateClustersByServer } from '../../hooks/mcp/shared'
import { getClusterHealthState, isClusterUnreachable } from './utils'
import { ConfirmDialog } from '../../lib/modals'

export interface ClusterGroupsSectionProps {
  /** All clusters (unfiltered) for the new-group cluster picker */
  clusters: ClusterInfo[]
  /** Existing cluster groups */
  clusterGroups: ClusterGroup[]
  /** Callback to add a new cluster group */
  addClusterGroup: (group: { name: string; clusters: string[] }) => void
  /** Callback to delete a cluster group by ID */
  deleteClusterGroup: (id: string) => void
  /** Callback to select/activate a cluster group by ID */
  selectClusterGroup: (id: string) => void
}

/**
 * Cluster Groups section rendered in the beforeCards area.
 * Displays existing cluster groups with the ability to create new ones.
 * Collapsed by default so cluster cards are visible first.
 */
export function ClusterGroupsSection({
  clusters,
  clusterGroups,
  addClusterGroup,
  deleteClusterGroup,
  selectClusterGroup,
}: ClusterGroupsSectionProps) {
  const { t } = useTranslation()
  const [showGroups, setShowGroups] = useState(false) // Collapsed by default so cluster cards are visible first
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupClusters, setNewGroupClusters] = useState<string[]>([])
  // Pending delete confirmation — null when no dialog is shown. Storing the
  // whole group (id + name) lets the dialog show the name while the confirm
  // handler deletes by id (#8916).
  const [deleteConfirmGroup, setDeleteConfirmGroup] = useState<{ id: string; name: string } | null>(null)

  // Deduplicate clusters so contexts pointing at the same server are not
  // rendered twice in the picker (#5922). Uses the same helper as the main
  // cluster list so both stay in sync.
  const pickerClusters = useMemo(() => deduplicateClustersByServer(clusters), [clusters])

  // When no groups exist and form is not showing, render just the New Group button
  if (clusterGroups.length === 0 && !showGroupForm) {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FolderOpen className="w-4 h-4" />
            <span>{t('clusters.groups.title', { count: 0 })}</span>
          </div>
          <button
            onClick={() => {
              setShowGroupForm(true)
              setShowGroups(true)
            }}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Group
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setShowGroups(!showGroups)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          <span>{t('clusters.groups.title', { count: clusterGroups.length })}</span>
          {showGroups ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setShowGroupForm(!showGroupForm)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Group
        </button>
      </div>

      {showGroups && (
        <div className="space-y-2">
          {/* New Group Form */}
          {showGroupForm && (
            <div className="glass p-4 rounded-lg space-y-3">
              <input
                type="text"
                placeholder="Group name..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <div className="text-xs text-muted-foreground mb-1">Select clusters for this group:</div>
              <div className="flex flex-wrap gap-2">
                {pickerClusters.map((cluster) => {
                  const isInGroup = newGroupClusters.includes(cluster.name)
                  // Use the shared health state machine so the picker icon
                  // always matches the main grid (#5920, #5928).
                  const healthState = getClusterHealthState(cluster)
                  const unreachable = isClusterUnreachable(cluster)
                  return (
                    <button
                      key={cluster.name}
                      onClick={() => {
                        if (isInGroup) {
                          setNewGroupClusters(prev => prev.filter(c => c !== cluster.name))
                        } else {
                          setNewGroupClusters(prev => [...prev, cluster.name])
                        }
                      }}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                        isInGroup
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent'
                      }`}
                      title={unreachable && cluster.errorMessage ? cluster.errorMessage : healthState}
                    >
                      {healthState === 'unreachable' ? (
                        <WifiOff className="w-3 h-3 text-yellow-400" />
                      ) : healthState === 'healthy' ? (
                        <CheckCircle className="w-3 h-3 text-green-400" />
                      ) : healthState === 'unhealthy' ? (
                        <AlertTriangle className="w-3 h-3 text-orange-400" />
                      ) : healthState === 'loading' ? (
                        <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                      ) : (
                        <HelpCircle className="w-3 h-3 text-muted-foreground" />
                      )}
                      {cluster.context || cluster.name}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowGroupForm(false)
                    setNewGroupName('')
                    setNewGroupClusters([])
                  }}
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (newGroupName.trim() && newGroupClusters.length > 0) {
                      addClusterGroup({ name: newGroupName.trim(), clusters: newGroupClusters })
                      setShowGroupForm(false)
                      setNewGroupName('')
                      setNewGroupClusters([])
                    }
                  }}
                  disabled={!newGroupName.trim() || newGroupClusters.length === 0}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-3.5 h-3.5" />
                  Create
                </button>
              </div>
            </div>
          )}

          {/* Existing Groups */}
          {clusterGroups.map((group) => (
            <div
              key={group.id}
              className="glass p-3 rounded-lg flex items-center justify-between hover:bg-secondary/30 transition-colors"
            >
              <button
                onClick={() => selectClusterGroup(group.id)}
                className="flex-1 flex items-center gap-3 text-left"
              >
                <FolderOpen className="w-4 h-4 text-purple-400" />
                <div>
                  <div className="font-medium text-foreground">{group.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {group.clusters.length} cluster{group.clusters.length !== 1 ? 's' : ''}
                    <span className="mx-1">·</span>
                    {group.clusters.slice(0, 3).join(', ')}
                    {group.clusters.length > 3 && ` +${group.clusters.length - 3} more`}
                  </div>
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  // Open confirmation dialog instead of deleting immediately (#8916).
                  setDeleteConfirmGroup({ id: group.id, name: group.name })
                }}
                className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                title={t('cluster.deleteGroup')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog — prevents accidental irreversible delete
          of a cluster group (#8916). */}
      <ConfirmDialog
        isOpen={deleteConfirmGroup !== null}
        onClose={() => setDeleteConfirmGroup(null)}
        onConfirm={() => {
          if (deleteConfirmGroup) {
            deleteClusterGroup(deleteConfirmGroup.id)
            setDeleteConfirmGroup(null)
          }
        }}
        title={t('clusters.groups.deleteTitle')}
        message={t('clusters.groups.deleteConfirm', {
          name: deleteConfirmGroup?.name ?? '',
          defaultValue: 'Delete cluster group "{{name}}"? This cannot be undone.',
        })}
        confirmLabel={t('actions.delete')}
        cancelLabel={t('actions.cancel')}
        variant="danger"
      />
    </div>
  )
}
