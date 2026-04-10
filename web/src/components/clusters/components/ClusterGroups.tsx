import { useMemo, useState } from 'react'
import { FolderOpen, ChevronDown, ChevronRight, Plus, Trash2, Check, WifiOff, CheckCircle, AlertTriangle, HelpCircle, Loader2 } from 'lucide-react'
import { ClusterInfo } from '../../../hooks/useMCP'
import { deduplicateClustersByServer } from '../../../hooks/mcp/shared'
import { getClusterHealthState, isClusterUnreachable } from '../utils'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../../../lib/modals'

export interface ClusterGroup {
  id: string
  name: string
  clusters: string[]
}

interface ClusterGroupsProps {
  clusters: ClusterInfo[]
  clusterGroups: ClusterGroup[]
  showGroups: boolean
  onShowGroupsChange: (show: boolean) => void
  onAddGroup: (group: { name: string; clusters: string[] }) => void
  onSelectGroup: (groupId: string) => void
  onDeleteGroup: (groupId: string) => void
}

export function ClusterGroups({
  clusters,
  clusterGroups,
  showGroups,
  onShowGroupsChange,
  onAddGroup,
  onSelectGroup,
  onDeleteGroup,
}: ClusterGroupsProps) {
  const { t } = useTranslation()
  const [formState, setFormState] = useState({
    showForm: false,
    name: '',
    clusters: [] as string[],
  })
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Deduplicate clusters so contexts pointing at the same server are not
  // rendered twice in the picker (#5922).
  const pickerClusters = useMemo(() => deduplicateClustersByServer(clusters), [clusters])

  const resetForm = () => setFormState({ showForm: false, name: '', clusters: [] })

  const handleCreateGroup = () => {
    if (formState.name.trim() && formState.clusters.length > 0) {
      onAddGroup({ name: formState.name.trim(), clusters: formState.clusters })
      resetForm()
    }
  }

  const handleCancel = () => {
    resetForm()
  }

  if (clusterGroups.length === 0 && !formState.showForm) {
    return null
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onShowGroupsChange(!showGroups)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          <span>Cluster Groups ({clusterGroups.length})</span>
          {showGroups ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setFormState(prev => ({ ...prev, showForm: !prev.showForm }))}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Group
        </button>
      </div>

      {showGroups && (
        <div className="space-y-2">
          {/* New Group Form */}
          {formState.showForm && (
            <div className="glass p-4 rounded-lg space-y-3">
              <input
                type="text"
                placeholder="Group name..."
                value={formState.name}
                onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <div className="text-xs text-muted-foreground mb-1">Select clusters for this group:</div>
              <div className="flex flex-wrap gap-2">
                {pickerClusters.map((cluster) => {
                  const isInGroup = formState.clusters.includes(cluster.name)
                  // Use the shared health state machine so the picker icon
                  // always matches the main grid (#5920, #5928).
                  const healthState = getClusterHealthState(cluster)
                  const unreachable = isClusterUnreachable(cluster)
                  return (
                    <button
                      key={cluster.name}
                      onClick={() => {
                        if (isInGroup) {
                          setFormState(prev => ({ ...prev, clusters: prev.clusters.filter(c => c !== cluster.name) }))
                        } else {
                          setFormState(prev => ({ ...prev, clusters: [...prev.clusters, cluster.name] }))
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
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGroup}
                  disabled={!formState.name.trim() || formState.clusters.length === 0}
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
                onClick={() => onSelectGroup(group.id)}
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
                  setDeleteConfirmId(group.id)
                }}
                className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                title="Delete group"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => {
          if (deleteConfirmId) {
            onDeleteGroup(deleteConfirmId)
            setDeleteConfirmId(null)
          }
        }}
        title={t('clusters.groups.deleteTitle')}
        message={t('clusters.groups.deleteMessage')}
        confirmLabel={t('actions.delete')}
        variant="danger"
      />
    </div>
  )
}
