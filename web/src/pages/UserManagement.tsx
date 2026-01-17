import { useState } from 'react'
import { Users, Shield, Key, Search, RefreshCw, Plus, ChevronRight } from 'lucide-react'
import { useConsoleUsers } from '../hooks/useUsers'
import { useClusters } from '../hooks/useMCP'
import { useGlobalFilters } from '../hooks/useGlobalFilters'
import { ClusterBadge } from '../components/ui/ClusterBadge'

type TabType = 'console' | 'kubernetes' | 'rbac'

export function UserManagementPage() {
  const [activeTab, setActiveTab] = useState<TabType>('console')
  const [searchQuery, setSearchQuery] = useState('')
  const { users, isLoading: usersLoading, refetch: refetchUsers } = useConsoleUsers()
  const { clusters } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  const tabs = [
    { key: 'console' as const, label: 'Console Users', icon: Users },
    { key: 'kubernetes' as const, label: 'Kubernetes RBAC', icon: Shield },
    { key: 'rbac' as const, label: 'Service Accounts', icon: Key },
  ]

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-400" />
            User Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage console users and Kubernetes RBAC across clusters
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetchUsers()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors">
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 p-1 rounded-lg bg-secondary/30 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              activeTab === tab.key
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${activeTab === 'console' ? 'users' : activeTab === 'kubernetes' ? 'roles and bindings' : 'service accounts'}...`}
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'console' && (
          <ConsoleUsersTab users={users} isLoading={usersLoading} searchQuery={searchQuery} />
        )}
        {activeTab === 'kubernetes' && (
          <KubernetesRBACTab clusters={clusters.map(c => c.name)} selectedClusters={selectedClusters} isAllClustersSelected={isAllClustersSelected} searchQuery={searchQuery} />
        )}
        {activeTab === 'rbac' && (
          <ServiceAccountsTab clusters={clusters.map(c => c.name)} selectedClusters={selectedClusters} isAllClustersSelected={isAllClustersSelected} searchQuery={searchQuery} />
        )}
      </div>
    </div>
  )
}

interface ConsoleUsersTabProps {
  users: Array<{
    id: string
    github_login: string
    email?: string
    role: string
    avatar_url?: string
    created_at: string
  }>
  isLoading: boolean
  searchQuery: string
}

function ConsoleUsersTab({ users, isLoading, searchQuery }: ConsoleUsersTabProps) {
  const filteredUsers = users.filter(user =>
    user.github_login.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  if (filteredUsers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
        <Users className="w-12 h-12 mb-3 opacity-50" />
        <p>No users found</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {filteredUsers.map(user => (
        <div
          key={user.id}
          className="flex items-center gap-4 p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors group"
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.github_login} className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{user.github_login}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                user.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-secondary text-muted-foreground'
              }`}>
                {user.role}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{user.email || 'No email'}</p>
          </div>
          <div className="text-xs text-muted-foreground">
            Joined {new Date(user.created_at).toLocaleDateString()}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      ))}
    </div>
  )
}

interface KubernetesRBACTabProps {
  clusters: string[]
  selectedClusters: string[]
  isAllClustersSelected: boolean
  searchQuery: string
}

function KubernetesRBACTab({ clusters, selectedClusters, isAllClustersSelected, searchQuery }: KubernetesRBACTabProps) {
  const targetClusters = isAllClustersSelected ? clusters : selectedClusters

  // Mock RBAC data
  const rbacItems = targetClusters.flatMap(cluster => [
    { cluster, type: 'ClusterRole', name: 'cluster-admin', rules: 'All resources', subjects: 'system:masters' },
    { cluster, type: 'ClusterRole', name: 'view', rules: 'Get, List, Watch', subjects: 'developers' },
    { cluster, type: 'Role', name: 'pod-reader', namespace: 'default', rules: 'Pods: Get, List', subjects: 'monitoring-sa' },
  ]).filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.cluster.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-2">
      {rbacItems.map((item, idx) => (
        <div
          key={`${item.cluster}-${item.type}-${item.name}-${idx}`}
          className="flex items-center gap-4 p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors group"
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            item.type === 'ClusterRole' ? 'bg-purple-500/20' : 'bg-blue-500/20'
          }`}>
            <Shield className={`w-5 h-5 ${item.type === 'ClusterRole' ? 'text-purple-400' : 'text-blue-400'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{item.name}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                {item.type}
              </span>
              {item.namespace && (
                <span className="text-xs text-muted-foreground">in {item.namespace}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Subjects: {item.subjects}</p>
          </div>
          <ClusterBadge cluster={item.cluster} size="sm" />
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      ))}
    </div>
  )
}

interface ServiceAccountsTabProps {
  clusters: string[]
  selectedClusters: string[]
  isAllClustersSelected: boolean
  searchQuery: string
}

function ServiceAccountsTab({ clusters, selectedClusters, isAllClustersSelected, searchQuery }: ServiceAccountsTabProps) {
  const targetClusters = isAllClustersSelected ? clusters : selectedClusters

  // Mock service account data
  const serviceAccounts = targetClusters.flatMap(cluster => [
    { cluster, namespace: 'default', name: 'default', secrets: 1, imagePullSecrets: 0 },
    { cluster, namespace: 'kube-system', name: 'coredns', secrets: 1, imagePullSecrets: 0 },
    { cluster, namespace: 'monitoring', name: 'prometheus', secrets: 2, imagePullSecrets: 1 },
    { cluster, namespace: 'monitoring', name: 'grafana', secrets: 1, imagePullSecrets: 0 },
  ]).filter(sa =>
    sa.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sa.namespace.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sa.cluster.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-2">
      {serviceAccounts.map((sa, idx) => (
        <div
          key={`${sa.cluster}-${sa.namespace}-${sa.name}-${idx}`}
          className="flex items-center gap-4 p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
            <Key className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{sa.name}</span>
              <span className="text-xs text-muted-foreground">in {sa.namespace}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {sa.secrets} secret{sa.secrets !== 1 ? 's' : ''}, {sa.imagePullSecrets} image pull secret{sa.imagePullSecrets !== 1 ? 's' : ''}
            </p>
          </div>
          <ClusterBadge cluster={sa.cluster} size="sm" />
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      ))}
    </div>
  )
}
