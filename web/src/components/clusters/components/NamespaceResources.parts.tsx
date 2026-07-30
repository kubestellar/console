import { ChevronRight, ChevronDown, Box, Layers, Network, Briefcase, Activity, Settings, Lock, User, HardDrive, Loader2, AlertCircle, List, GitBranch } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PodInfo, Deployment } from '../../../hooks/useMCP'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { SimpleResourceRow } from './SimpleResourceRow'
import { getStatusBgColor, type ResourceKind, type NamespaceResourceRow } from './namespaceResourceUtils'

/** Resource kind icon mapping for the list view. */
// eslint-disable-next-line react-refresh/only-export-components
export function getKindIcon(kind: ResourceKind) {
  switch (kind) {
    case 'Pod': return <Box className="w-3.5 h-3.5 text-blue-400" />
    case 'Deployment': return <Layers className="w-3.5 h-3.5 text-purple-400" />
    case 'Service': return <Network className="w-3.5 h-3.5 text-cyan-400" />
    case 'Job': return <Briefcase className="w-3.5 h-3.5 text-yellow-400" />
    case 'HPA': return <Activity className="w-3.5 h-3.5 text-purple-400" />
    case 'ConfigMap': return <Settings className="w-3.5 h-3.5 text-orange-400" />
    case 'Secret': return <Lock className="w-3.5 h-3.5 text-purple-400" />
    case 'ServiceAccount': return <User className="w-3.5 h-3.5 text-cyan-400" />
    case 'PVC': return <HardDrive className="w-3.5 h-3.5 text-green-400" />
  }
}

/** Full-screen loading placeholder shown while initial data is fetching. */
export function NamespaceLoadingView() {
  return (
    <div className="py-4 flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading namespace resources...
    </div>
  )
}

/** Shown when the loading timeout fires and we still have no data. */
export function NamespaceTimedOutView() {
  return (
    <div className="py-4 flex items-center gap-2 text-sm text-yellow-400">
      <AlertCircle className="w-4 h-4" />
      Loading timed out. The cluster may be unreachable or slow to respond.
    </div>
  )
}

/** Shown when a namespace has no resources at all. */
export function NamespaceEmptyState() {
  return (
    <div className="text-sm text-muted-foreground text-center py-4">
      No resources found in this namespace
    </div>
  )
}

interface ResourceViewToolbarProps {
  viewMode: 'list' | 'tree'
  setViewMode: (mode: 'list' | 'tree') => void
  isPartiallyLoading: boolean
  isRefreshing: boolean
  lastUpdated: Date | null
}

/** Toolbar with view-mode toggle (list/tree) and a refresh/loading indicator. */
export function ResourceViewToolbar({ viewMode, setViewMode, isPartiallyLoading, isRefreshing, lastUpdated }: ResourceViewToolbarProps) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-between items-center pb-2">
      {isPartiallyLoading && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('common.loadingMore')}</span>
        </div>
      )}
      {!isPartiallyLoading && (
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
          size="xs"
        />
      )}
      <div className="flex items-center gap-1 p-0.5 rounded bg-secondary/50">
        <button
          onClick={() => setViewMode('list')}
          className={`min-h-11 min-w-11 flex items-center justify-center rounded transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          title="List view"
          aria-label="List view"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setViewMode('tree')}
          className={`min-h-11 min-w-11 flex items-center justify-center rounded transition-colors ${viewMode === 'tree' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          title="Tree view"
          aria-label="Tree view"
        >
          <GitBranch className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

interface ListResourceRowProps {
  resource: NamespaceResourceRow
  onClick: () => void
}

/** A single resource row in the flat list view. */
export function ListResourceRow({ resource, onClick }: ListResourceRowProps) {
  return (
    <div
      className="flex items-center justify-between p-2 min-h-11 rounded bg-card/30 text-sm group hover:bg-card/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 min-w-0">
        {getKindIcon(resource.kind)}
        <span className="text-foreground truncate">{resource.name}</span>
      </div>
      <div className="flex items-center gap-2 text-xs shrink-0">
        {resource.detail && <span className="text-muted-foreground">{resource.detail}</span>}
        {resource.status && (
          <span className={`px-1.5 py-0.5 rounded ${getStatusBgColor(resource.statusColor)}`}>
            {resource.status}
          </span>
        )}
        <ChevronRight className="w-3 h-3 text-primary" />
      </div>
    </div>
  )
}

interface DeploymentTreeRowProps {
  dep: Deployment
  depPods: PodInfo[]
  isExpanded: boolean
  onToggle: () => void
  onDeploymentClick: () => void
  onPodClick: (pod: PodInfo) => void
}

const MAX_PODS_PER_DEPLOYMENT = 10

/** Deployment row with expandable pod list for the tree view. */
export function DeploymentTreeRow({ dep, depPods, isExpanded, onToggle, onDeploymentClick, onPodClick }: DeploymentTreeRowProps) {
  return (
    <div className="mb-0.5">
      <div className="flex items-center gap-2 min-h-11 px-1 rounded hover:bg-card/30">
        <button onClick={() => depPods.length > 0 && onToggle()} className="min-h-11 min-w-[44px] flex items-center justify-center">
          {depPods.length > 0
            ? (isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />)
            : <span className="w-3" />}
        </button>
        <button
          onClick={onDeploymentClick}
          className="flex items-center gap-2 flex-1 min-h-11"
        >
          <span className="text-foreground">{dep.name}</span>
          <span className={`text-xs ${dep.readyReplicas === dep.replicas ? 'text-green-400' : 'text-orange-400'}`}>{dep.readyReplicas}/{dep.replicas}</span>
          {depPods.length > 0 && <span className="text-xs text-muted-foreground">({depPods.length} pods)</span>}
          <ChevronRight className="w-3 h-3 text-primary ml-auto" />
        </button>
      </div>
      {isExpanded && depPods.length > 0 && (
        <div className="ml-4 border-l border-border/30 pl-2">
          {depPods.slice(0, MAX_PODS_PER_DEPLOYMENT).map(pod => (
            <SimpleResourceRow
              key={pod.name}
              icon={<Box className="w-3 h-3 text-blue-400" />}
              name={pod.name}
              primaryText={pod.status}
              primaryClassName={pod.status === 'Running' ? 'text-green-400' : pod.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}
              onClick={() => onPodClick(pod)}
            />
          ))}
          {depPods.length > MAX_PODS_PER_DEPLOYMENT && (
            <div className="text-xs text-muted-foreground pl-5">+{depPods.length - MAX_PODS_PER_DEPLOYMENT} more</div>
          )}
        </div>
      )}
    </div>
  )
}
