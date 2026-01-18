import { useState, useEffect, useCallback } from 'react'
import {
  Folder,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserPlus,
  Trash2,
  ChevronRight,
  X,
  AlertTriangle
} from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { usePermissions } from '../../hooks/usePermissions'
import { ClusterBadge } from '../ui/ClusterBadge'
import { api } from '../../lib/api'

interface NamespaceDetails {
  name: string
  cluster: string
  status: string
  labels?: Record<string, string>
  createdAt: string
}

interface NamespaceAccessEntry {
  bindingName: string
  subjectKind: string
  subjectName: string
  subjectNamespace?: string
  roleName: string
  roleKind: string
}

export function NamespaceManager() {
  const { clusters } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isClusterAdmin } = usePermissions()
  const [namespaces, setNamespaces] = useState<NamespaceDetails[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNamespace, setSelectedNamespace] = useState<NamespaceDetails | null>(null)
  const [accessEntries, setAccessEntries] = useState<NamespaceAccessEntry[]>([])
  const [accessLoading, setAccessLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showGrantAccessModal, setShowGrantAccessModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetClusters = isAllClustersSelected
    ? clusters.map(c => c.name)
    : selectedClusters

  // Filter to only clusters where user is admin
  const adminClusters = targetClusters.filter(c => isClusterAdmin(c))

  const fetchNamespaces = useCallback(async () => {
    if (adminClusters.length === 0) return

    setLoading(true)
    setError(null)

    try {
      const allNamespaces: NamespaceDetails[] = []
      for (const cluster of adminClusters) {
        const response = await api.get(`/namespaces?cluster=${cluster}`)
        if (response.data) {
          allNamespaces.push(...response.data)
        }
      }
      setNamespaces(allNamespaces)
    } catch (err) {
      console.error('Failed to fetch namespaces:', err)
      setError('Failed to fetch namespaces')
    } finally {
      setLoading(false)
    }
  }, [adminClusters])

  const fetchAccess = useCallback(async (namespace: NamespaceDetails) => {
    setAccessLoading(true)
    try {
      const response = await api.get(`/namespaces/${namespace.name}/access?cluster=${namespace.cluster}`)
      setAccessEntries(response.data?.bindings || [])
    } catch (err) {
      console.error('Failed to fetch access:', err)
      setAccessEntries([])
    } finally {
      setAccessLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNamespaces()
  }, [fetchNamespaces])

  useEffect(() => {
    if (selectedNamespace) {
      fetchAccess(selectedNamespace)
    }
  }, [selectedNamespace, fetchAccess])

  const filteredNamespaces = namespaces.filter(ns =>
    ns.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ns.cluster.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Filter out system namespaces
  const userNamespaces = filteredNamespaces.filter(ns =>
    !ns.name.startsWith('kube-') &&
    !ns.name.startsWith('openshift-') &&
    ns.name !== 'default'
  )

  const systemNamespaces = filteredNamespaces.filter(ns =>
    ns.name.startsWith('kube-') ||
    ns.name.startsWith('openshift-') ||
    ns.name === 'default'
  )

  const handleDeleteNamespace = async (ns: NamespaceDetails) => {
    if (!confirm(`Are you sure you want to delete namespace "${ns.name}" from cluster "${ns.cluster}"? This action cannot be undone.`)) {
      return
    }

    try {
      await api.delete(`/namespaces/${ns.name}?cluster=${ns.cluster}`)
      fetchNamespaces()
      if (selectedNamespace?.name === ns.name && selectedNamespace?.cluster === ns.cluster) {
        setSelectedNamespace(null)
      }
    } catch (err) {
      console.error('Failed to delete namespace:', err)
      setError('Failed to delete namespace')
    }
  }

  const handleRevokeAccess = async (binding: NamespaceAccessEntry) => {
    if (!selectedNamespace) return

    if (!confirm(`Revoke access for ${binding.subjectName}?`)) {
      return
    }

    try {
      await api.delete(`/namespaces/${selectedNamespace.name}/access/${binding.bindingName}?cluster=${selectedNamespace.cluster}`)
      fetchAccess(selectedNamespace)
    } catch (err) {
      console.error('Failed to revoke access:', err)
      setError('Failed to revoke access')
    }
  }

  if (adminClusters.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <AlertTriangle className="w-16 h-16 text-amber-400 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Admin Access Required</h2>
        <p className="text-muted-foreground text-center max-w-md">
          You need cluster-admin access to manage namespaces. Select a cluster where you have admin privileges.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Folder className="w-6 h-6 text-blue-400" />
            Namespace Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Create namespaces and manage access across clusters
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchNamespaces()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Namespace
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search namespaces..."
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Namespace list */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* User namespaces */}
          {userNamespaces.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                User Namespaces ({userNamespaces.length})
              </h3>
              <div className="space-y-2">
                {userNamespaces.map(ns => (
                  <NamespaceCard
                    key={`${ns.cluster}-${ns.name}`}
                    namespace={ns}
                    isSelected={selectedNamespace?.name === ns.name && selectedNamespace?.cluster === ns.cluster}
                    onSelect={() => setSelectedNamespace(ns)}
                    onDelete={() => handleDeleteNamespace(ns)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* System namespaces */}
          {systemNamespaces.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                System Namespaces ({systemNamespaces.length})
              </h3>
              <div className="space-y-2">
                {systemNamespaces.map(ns => (
                  <NamespaceCard
                    key={`${ns.cluster}-${ns.name}`}
                    namespace={ns}
                    isSelected={selectedNamespace?.name === ns.name && selectedNamespace?.cluster === ns.cluster}
                    onSelect={() => setSelectedNamespace(ns)}
                    isSystem
                  />
                ))}
              </div>
            </div>
          )}

          {filteredNamespaces.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Folder className="w-12 h-12 mb-3 opacity-50" />
              <p>No namespaces found</p>
            </div>
          )}
        </div>

        {/* Access panel */}
        {selectedNamespace && (
          <div className="w-96 glass rounded-xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-white">{selectedNamespace.name}</h3>
                <p className="text-sm text-muted-foreground">Access Management</p>
              </div>
              <button
                onClick={() => setShowGrantAccessModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors text-sm"
              >
                <UserPlus className="w-4 h-4" />
                Grant Access
              </button>
            </div>

            <ClusterBadge cluster={selectedNamespace.cluster} size="sm" className="mb-4" />

            {accessLoading ? (
              <div className="flex items-center justify-center h-20">
                <div className="spinner w-6 h-6" />
              </div>
            ) : accessEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No role bindings found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {accessEntries.map((entry, idx) => (
                  <div
                    key={`${entry.bindingName}-${idx}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{entry.subjectName}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                          {entry.subjectKind}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Role: {entry.roleName}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevokeAccess(entry)}
                      className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Revoke access"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Namespace Modal */}
      {showCreateModal && (
        <CreateNamespaceModal
          clusters={adminClusters}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            fetchNamespaces()
          }}
        />
      )}

      {/* Grant Access Modal */}
      {showGrantAccessModal && selectedNamespace && (
        <GrantAccessModal
          namespace={selectedNamespace}
          onClose={() => setShowGrantAccessModal(false)}
          onGranted={() => {
            setShowGrantAccessModal(false)
            fetchAccess(selectedNamespace)
          }}
        />
      )}
    </div>
  )
}

interface NamespaceCardProps {
  namespace: NamespaceDetails
  isSelected: boolean
  onSelect: () => void
  onDelete?: () => void
  isSystem?: boolean
}

function NamespaceCard({ namespace, isSelected, onSelect, onDelete, isSystem }: NamespaceCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-4 p-4 rounded-lg cursor-pointer transition-colors group ${
        isSelected
          ? 'bg-blue-500/20 border border-blue-500/50'
          : 'bg-secondary/30 hover:bg-secondary/50 border border-transparent'
      }`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        isSystem ? 'bg-gray-500/20' : 'bg-blue-500/20'
      }`}>
        <Folder className={`w-5 h-5 ${isSystem ? 'text-gray-400' : 'text-blue-400'}`} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{namespace.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            namespace.status === 'Active'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            {namespace.status}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Created {new Date(namespace.createdAt).toLocaleDateString()}
        </p>
      </div>
      <ClusterBadge cluster={namespace.cluster} size="sm" />
      {!isSystem && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-2 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
          title="Delete namespace"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </div>
  )
}

interface CreateNamespaceModalProps {
  clusters: string[]
  onClose: () => void
  onCreated: () => void
}

function CreateNamespaceModal({ clusters, onClose, onCreated }: CreateNamespaceModalProps) {
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState(clusters[0] || '')
  const [teamLabel, setTeamLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name || !cluster) return

    setCreating(true)
    setError(null)

    try {
      const labels: Record<string, string> = {}
      if (teamLabel) {
        labels['team'] = teamLabel
      }

      await api.post('/namespaces', {
        cluster,
        name,
        labels: Object.keys(labels).length > 0 ? labels : undefined,
      })
      onCreated()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create namespace'
      setError(errorMessage)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="glass rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Create Namespace</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Cluster</label>
            <select
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {clusters.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Namespace Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="my-namespace"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Team Label (optional)</label>
            <input
              type="text"
              value={teamLabel}
              onChange={(e) => setTeamLabel(e.target.value)}
              placeholder="platform-team"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-muted-foreground hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name || !cluster || creating}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface GrantAccessModalProps {
  namespace: NamespaceDetails
  onClose: () => void
  onGranted: () => void
}

function GrantAccessModal({ namespace, onClose, onGranted }: GrantAccessModalProps) {
  const [subjectKind, setSubjectKind] = useState<'User' | 'Group' | 'ServiceAccount'>('User')
  const [subjectName, setSubjectName] = useState('')
  const [subjectNS, setSubjectNS] = useState('')
  const [role, setRole] = useState('admin')
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGrant = async () => {
    if (!subjectName) return

    setGranting(true)
    setError(null)

    try {
      await api.post(`/namespaces/${namespace.name}/access`, {
        cluster: namespace.cluster,
        subjectKind,
        subjectName,
        subjectNamespace: subjectKind === 'ServiceAccount' ? subjectNS : undefined,
        role,
      })
      onGranted()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to grant access'
      setError(errorMessage)
    } finally {
      setGranting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="glass rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Grant Access</h2>
            <p className="text-sm text-muted-foreground">Namespace: {namespace.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Subject Type</label>
            <select
              value={subjectKind}
              onChange={(e) => setSubjectKind(e.target.value as 'User' | 'Group' | 'ServiceAccount')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="User">User</option>
              <option value="Group">Group</option>
              <option value="ServiceAccount">Service Account</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {subjectKind === 'User' ? 'Username / Email' : subjectKind === 'Group' ? 'Group Name' : 'Service Account Name'}
            </label>
            <input
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder={subjectKind === 'User' ? 'alice@example.com' : subjectKind === 'Group' ? 'developers' : 'my-service-account'}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {subjectKind === 'ServiceAccount' && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Service Account Namespace</label>
              <input
                type="text"
                value={subjectNS}
                onChange={(e) => setSubjectNS(e.target.value)}
                placeholder="default"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="admin">Admin (full access)</option>
              <option value="edit">Edit (create/update/delete resources)</option>
              <option value="view">View (read-only)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-muted-foreground hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGrant}
            disabled={!subjectName || granting}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {granting ? 'Granting...' : 'Grant Access'}
          </button>
        </div>
      </div>
    </div>
  )
}
