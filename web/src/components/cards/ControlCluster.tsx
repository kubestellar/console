import { useState, useMemo } from 'react'
import {
  Crown,
  Server,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Wifi,
  WifiOff,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Layers,
  GitBranch
} from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { RefreshButton } from '../ui/RefreshIndicator'

// Types for control cluster
type ClusterType = 'Control' | 'Workload' | 'Inventory' | 'Unknown'
type RegistrationStatus = 'Ready' | 'Pending' | 'Syncing' | 'Degraded' | 'Offline' | 'Unknown'

interface ControllerState {
  ready: boolean
  replicas: number
  available: number
  message?: string
}

interface SyncerStatus {
  running: boolean
  version: string
  syncedObjects: number
  pendingObjects: number
  errorCount: number
  lastError?: string
}

interface ClusterRegistration {
  name: string
  clusterType: ClusterType
  status: RegistrationStatus
  kubernetesVersion: string
  platform: string
  region: string
  labels: Record<string, string>
  syncerStatus?: SyncerStatus
  lastHeartbeat: string
}

interface ControlClusterInfo {
  name: string
  isControlCluster: boolean
  kubeStellarVersion: string
  controllerStatus: Record<string, ControllerState>
  managedClusters: number
  totalBindings: number
  activePlacements: number
}

// Demo data
const DEMO_CONTROL_CLUSTER: ControlClusterInfo = {
  name: 'ks-control',
  isControlCluster: true,
  kubeStellarVersion: 'v0.23.0',
  controllerStatus: {
    'kubestellar-controller-manager': { ready: true, replicas: 1, available: 1 },
    'transport-controller': { ready: true, replicas: 1, available: 1 },
    'placement-translator': { ready: true, replicas: 1, available: 1 },
  },
  managedClusters: 4,
  totalBindings: 12,
  activePlacements: 8,
}

const DEMO_REGISTRATIONS: ClusterRegistration[] = [
  {
    name: 'ks-control',
    clusterType: 'Control',
    status: 'Ready',
    kubernetesVersion: 'v1.29.2',
    platform: 'kind',
    region: 'local',
    labels: { role: 'control', env: 'dev' },
    lastHeartbeat: new Date().toISOString(),
  },
  {
    name: 'wec-us-east',
    clusterType: 'Workload',
    status: 'Ready',
    kubernetesVersion: 'v1.28.5',
    platform: 'EKS',
    region: 'us-east-1',
    labels: { env: 'production', tier: 'frontend' },
    syncerStatus: {
      running: true,
      version: 'v0.23.0',
      syncedObjects: 45,
      pendingObjects: 0,
      errorCount: 0,
    },
    lastHeartbeat: new Date().toISOString(),
  },
  {
    name: 'wec-eu-west',
    clusterType: 'Workload',
    status: 'Ready',
    kubernetesVersion: 'v1.28.5',
    platform: 'GKE',
    region: 'eu-west-1',
    labels: { env: 'production', tier: 'backend' },
    syncerStatus: {
      running: true,
      version: 'v0.23.0',
      syncedObjects: 38,
      pendingObjects: 2,
      errorCount: 0,
    },
    lastHeartbeat: new Date().toISOString(),
  },
  {
    name: 'wec-ap-south',
    clusterType: 'Workload',
    status: 'Syncing',
    kubernetesVersion: 'v1.27.8',
    platform: 'AKS',
    region: 'ap-south-1',
    labels: { env: 'staging' },
    syncerStatus: {
      running: true,
      version: 'v0.22.1',
      syncedObjects: 20,
      pendingObjects: 15,
      errorCount: 1,
      lastError: 'Timeout syncing configmap/app-config',
    },
    lastHeartbeat: new Date(Date.now() - 30000).toISOString(),
  },
  {
    name: 'wec-edge-1',
    clusterType: 'Workload',
    status: 'Offline',
    kubernetesVersion: 'v1.26.10',
    platform: 'k3s',
    region: 'edge',
    labels: { env: 'edge', location: 'factory-1' },
    syncerStatus: {
      running: false,
      version: 'v0.22.0',
      syncedObjects: 12,
      pendingObjects: 8,
      errorCount: 5,
      lastError: 'Connection refused',
    },
    lastHeartbeat: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
]

const StatusIcon = ({ status }: { status: RegistrationStatus }) => {
  switch (status) {
    case 'Ready':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'Syncing':
      return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
    case 'Pending':
      return <Clock className="h-4 w-4 text-yellow-500" />
    case 'Degraded':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    case 'Offline':
      return <WifiOff className="h-4 w-4 text-red-500" />
    default:
      return <XCircle className="h-4 w-4 text-gray-400" />
  }
}

const ClusterTypeIcon = ({ type }: { type: ClusterType }) => {
  switch (type) {
    case 'Control':
      return <Crown className="h-4 w-4 text-purple-500" />
    case 'Workload':
      return <Server className="h-4 w-4 text-blue-500" />
    case 'Inventory':
      return <Layers className="h-4 w-4 text-green-500" />
    default:
      return <Server className="h-4 w-4 text-gray-400" />
  }
}

const statusColors: Record<RegistrationStatus, string> = {
  Ready: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  Syncing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  Degraded: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  Offline: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  Unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

interface ControlClusterProps {
  config?: Record<string, unknown>
  onRefresh?: () => void
  isRefreshing?: boolean
}

export function ControlCluster({ onRefresh, isRefreshing = false }: ControlClusterProps) {
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null)
  const [showControllers, setShowControllers] = useState(false)

  // Using demo data
  const controlInfo = DEMO_CONTROL_CLUSTER
  const registrations = DEMO_REGISTRATIONS

  const stats = useMemo(() => {
    const ready = registrations.filter((r) => r.status === 'Ready').length
    const syncing = registrations.filter((r) => r.status === 'Syncing').length
    const offline = registrations.filter((r) => r.status === 'Offline').length
    const workloadClusters = registrations.filter((r) => r.clusterType === 'Workload').length
    return { ready, syncing, offline, workloadClusters, total: registrations.length }
  }, [registrations])

  const controllerCount = Object.keys(controlInfo.controllerStatus).length
  const readyControllers = Object.values(controlInfo.controllerStatus).filter((c) => c.ready).length

  return (
    <div className="h-full flex flex-col ring-2 ring-yellow-400/50 rounded-lg">
      {/* Demo badge */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-3 py-1 text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        Demo data - Connect to KubeStellar control cluster for real data
      </div>

      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-purple-500" />
          <h3 className="font-medium text-gray-900 dark:text-gray-100">KubeStellar Control Cluster</h3>
        </div>
        <RefreshButton onRefresh={onRefresh} isRefreshing={isRefreshing} />
      </div>

      {/* Control cluster info */}
      <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-purple-500" />
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{controlInfo.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                KubeStellar {controlInfo.kubeStellarVersion}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-center">
              <div className="font-semibold text-purple-600 dark:text-purple-400">
                {controlInfo.managedClusters}
              </div>
              <div className="text-xs text-gray-500">Clusters</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-blue-600 dark:text-blue-400">{controlInfo.totalBindings}</div>
              <div className="text-xs text-gray-500">Bindings</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-green-600 dark:text-green-400">
                {controlInfo.activePlacements}
              </div>
              <div className="text-xs text-gray-500">Placements</div>
            </div>
          </div>
        </div>

        {/* Controller status toggle */}
        <button
          onClick={() => setShowControllers(!showControllers)}
          className="mt-2 flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
        >
          {showControllers ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Controllers ({readyControllers}/{controllerCount} ready)
        </button>

        {showControllers && (
          <div className="mt-2 space-y-1">
            {Object.entries(controlInfo.controllerStatus).map(([name, state]) => (
              <div
                key={name}
                className="flex items-center justify-between text-xs bg-white dark:bg-gray-800 rounded px-2 py-1"
              >
                <span className="truncate">{name}</span>
                <div className="flex items-center gap-1">
                  {state.ready ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500" />
                  )}
                  <span className="text-gray-500">
                    {state.available}/{state.replicas}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-green-600">{stats.ready}</div>
          <div className="text-xs text-gray-500">Ready</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-blue-600">{stats.syncing}</div>
          <div className="text-xs text-gray-500">Syncing</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-red-600">{stats.offline}</div>
          <div className="text-xs text-gray-500">Offline</div>
        </div>
      </div>

      {/* Cluster list */}
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {registrations.map((cluster) => (
            <div key={cluster.name} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <div
                className="flex items-start justify-between cursor-pointer"
                onClick={() => setExpandedCluster(expandedCluster === cluster.name ? null : cluster.name)}
              >
                <div className="flex items-start gap-2">
                  <ClusterTypeIcon type={cluster.clusterType} />
                  <div>
                    <div className="flex items-center gap-2">
                      <ClusterBadge cluster={cluster.name} size="sm" />
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[cluster.status]}`}>
                        {cluster.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{cluster.platform}</span>
                      <span className="text-gray-300 dark:text-gray-600">|</span>
                      <span>{cluster.region}</span>
                      <span className="text-gray-300 dark:text-gray-600">|</span>
                      <span>{cluster.kubernetesVersion}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusIcon status={cluster.status} />
                  {expandedCluster === cluster.name ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {expandedCluster === cluster.name && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 space-y-2">
                  {/* Labels */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Labels</span>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {Object.entries(cluster.labels).map(([k, v]) => (
                        <span
                          key={k}
                          className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono"
                        >
                          {k}={v}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Syncer status for workload clusters */}
                  {cluster.syncerStatus && (
                    <div className="bg-gray-100 dark:bg-gray-700 rounded p-2 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          Syncer {cluster.syncerStatus.version}
                        </span>
                        {cluster.syncerStatus.running ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <Wifi className="h-3 w-3" /> Running
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600">
                            <WifiOff className="h-3 w-3" /> Stopped
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500">Synced:</span>{' '}
                          <span className="font-medium">{cluster.syncerStatus.syncedObjects}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Pending:</span>{' '}
                          <span
                            className={`font-medium ${cluster.syncerStatus.pendingObjects > 0 ? 'text-yellow-600' : ''}`}
                          >
                            {cluster.syncerStatus.pendingObjects}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Errors:</span>{' '}
                          <span
                            className={`font-medium ${cluster.syncerStatus.errorCount > 0 ? 'text-red-600' : ''}`}
                          >
                            {cluster.syncerStatus.errorCount}
                          </span>
                        </div>
                      </div>
                      {cluster.syncerStatus.lastError && (
                        <div className="text-xs text-red-600 truncate" title={cluster.syncerStatus.lastError}>
                          {cluster.syncerStatus.lastError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
