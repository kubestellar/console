import { useState, useEffect } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Container, RefreshCw, Plus, Trash2, Check, AlertCircle, AlertTriangle, Loader2, X, Plug, Unplug, Bot, ExternalLink, Monitor } from 'lucide-react'
import { Button } from '../../ui/Button'
import { useLocalClusterTools } from '../../../hooks/useLocalClusterTools'
import type { VClusterActionFeedback } from '../../../hooks/useLocalClusterTools'
import { CLUSTER_PROGRESS_AUTO_DISMISS_MS } from '../../../hooks/useClusterProgress'
import { emitLocalClusterCreated } from '../../../lib/analytics'
import { friendlyErrorMessage } from '../../../lib/clusterErrors'
import { useMissions } from '../../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../../cards/console-missions/shared'
import { useClusters } from '../../../hooks/mcp/clusters'
import type { ClusterProgress } from '../../../hooks/useClusterProgress'
import { ConfirmDialog } from '../../../lib/modals'

/** Default namespace for new vCluster instances */
const VCLUSTER_DEFAULT_NAMESPACE = 'vcluster'

/** Namespace where KubeVirt is typically installed */
const KUBEVIRT_NAMESPACE = 'kubevirt'

/** Deep-link route for the KubeVirt install mission in console-kb */
const KUBEVIRT_MISSION_ROUTE = '/missions/install-kubevirt'

// ------------------------------------------------------------------
// ClusterProgressBanner — inline progress feedback for create/delete
// Modeled on UpdateProgressBanner (same visual language).
// ------------------------------------------------------------------
function ClusterProgressBanner({
  progress,
  onDismiss,
}: {
  progress: ClusterProgress | null
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (progress) {
      setVisible(true)
    }
  }, [progress])

  // Auto-dismiss after success
  useEffect(() => {
    if (progress?.status === 'done') {
      const timer = setTimeout(() => {
        setVisible(false)
        onDismiss()
      }, CLUSTER_PROGRESS_AUTO_DISMISS_MS)
      return () => clearTimeout(timer)
    }
  }, [progress?.status, onDismiss])

  if (!visible || !progress) return null

  const isActive = !['done', 'failed'].includes(progress.status)
  const isDone = progress.status === 'done'
  const isFailed = progress.status === 'failed'

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm mb-4 ${
        isDone
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : isFailed
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
      }`}
      role="status"
      aria-live="polite"
    >
      {isActive && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {isDone && <Check className="w-4 h-4 shrink-0" />}
      {isFailed && <AlertTriangle className="w-4 h-4 shrink-0" />}

      <span className="flex-1">
        {isFailed ? friendlyErrorMessage(progress.message) : progress.message}
      </span>

      {isActive && (
        <div className="w-24 bg-secondary rounded-full h-1.5 shrink-0">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      )}

      <button
        onClick={() => {
          setVisible(false)
          onDismiss()
        }}
        className="p-1 hover:bg-secondary/50 rounded shrink-0"
        aria-label={t('actions.dismiss')}
        title={t('actions.dismiss')}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

function getVClusterActionMessage(feedback: VClusterActionFeedback, t: TFunction): string {
  const keyBase = `settings.localClusters.vclusterFeedback.${feedback.action}.${feedback.state}`

  if (feedback.state === 'error') {
    return feedback.message
      ? friendlyErrorMessage(feedback.message)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : String(t(`${keyBase}Fallback` as any, { name: feedback.name, namespace: feedback.namespace }))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return String(t(keyBase as any, { name: feedback.name, namespace: feedback.namespace }))
}

function VClusterActionBanner({
  feedback,
  onDismiss,
}: {
  feedback: VClusterActionFeedback | null
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (feedback) {
      setVisible(true)
    }
  }, [feedback])

  useEffect(() => {
    if (feedback?.state === 'success') {
      const timer = setTimeout(() => {
        setVisible(false)
        onDismiss()
      }, CLUSTER_PROGRESS_AUTO_DISMISS_MS)
      return () => clearTimeout(timer)
    }
  }, [feedback?.state, onDismiss])

  if (!visible || !feedback) return null

  const isPending = feedback.state === 'pending'
  const isSuccess = feedback.state === 'success'
  const isError = feedback.state === 'error'

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm mb-4 ${
        isSuccess
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : isError
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
      }`}
      role="status"
      aria-live="polite"
    >
      {isPending && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {isSuccess && <Check className="w-4 h-4 shrink-0" />}
      {isError && <AlertTriangle className="w-4 h-4 shrink-0" />}

      <span className="flex-1">{getVClusterActionMessage(feedback, t)}</span>

      <button
        onClick={() => {
          setVisible(false)
          onDismiss()
        }}
        className="p-1 hover:bg-secondary/50 rounded shrink-0"
        aria-label={t('actions.dismiss')}
        title={t('actions.dismiss')}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ------------------------------------------------------------------
// LocalClustersSection
// ------------------------------------------------------------------
export function LocalClustersSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    installedTools,
    clusters,
    isLoading,
    isCreating,
    isDeleting,
    error,
    isConnected,
    isDemoMode,
    clusterProgress,
    dismissProgress,
    createCluster,
    deleteCluster,
    refresh,
    // vCluster state and actions
    vclusterInstances,
    vclusterClusterStatus,
    checkVClusterOnCluster,
    isConnecting,
    isDisconnecting,
    vclusterActionFeedback,
    dismissVClusterActionFeedback,
    createVCluster,
    connectVCluster,
    disconnectVCluster,
    deleteVCluster,
  } = useLocalClusterTools()

  const { startMission } = useMissions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  const [selectedTool, setSelectedTool] = useState<string>('')
  const [clusterName, setClusterName] = useState('')

  // vCluster form state
  const [vclusterName, setVclusterName] = useState('')
  const [vclusterNamespace, setVclusterNamespace] = useState(VCLUSTER_DEFAULT_NAMESPACE)
  const [vclusterHostCluster, setVclusterHostCluster] = useState('')

  // Delete confirmation state
  const [deleteClusterConfirm, setDeleteClusterConfirm] = useState<{ tool: string; name: string } | null>(null)
  const [deleteVClusterConfirm, setDeleteVClusterConfirm] = useState<{ name: string; namespace: string } | null>(null)

  const { deduplicatedClusters: connectedClusters } = useClusters()
  const healthyClusters = (connectedClusters || []).filter(c => c.healthy !== false)

  const hasVClusterTool = installedTools.some(t => t.name === 'vcluster')
  /** Local cluster tools excluding vcluster (vcluster has its own section) */
  const localClusterTools = installedTools.filter(t => t.name !== 'vcluster')

  // KubeVirt detection: check which connected clusters have the kubevirt namespace
  const kubevirtClusters = (healthyClusters || []).filter(c =>
    (c.namespaces || []).includes(KUBEVIRT_NAMESPACE),
  )
  const hasKubevirtAnywhere = kubevirtClusters.length > 0

  const handleCreate = async () => {
    if (!selectedTool || !clusterName.trim()) return
    try {
      const result = await createCluster(selectedTool, clusterName.trim())
      emitLocalClusterCreated(selectedTool)

      if (result.status === 'creating') {
        setClusterName('')
        // Real-time progress is now handled by ClusterProgressBanner via WebSocket
      }
    } catch {
      // createCluster handles errors internally; ignore unexpected throws
    }
  }

  const handleDelete = async (tool: string, name: string) => {
    try {
      await deleteCluster(tool, name)
    } catch {
      // deleteCluster handles errors internally; ignore unexpected throws
    }
  }

  const handleCreateVCluster = async () => {
    if (!vclusterName.trim()) return
    try {
      const result = await createVCluster(vclusterName.trim(), vclusterNamespace.trim() || VCLUSTER_DEFAULT_NAMESPACE)
      emitLocalClusterCreated('vcluster')

      if (result.status === 'creating') {
        setVclusterName('')
        setVclusterNamespace(VCLUSTER_DEFAULT_NAMESPACE)
      }
    } catch {
      // createVCluster handles errors internally; ignore unexpected throws
    }
  }

  const handleDeleteVCluster = async (name: string, namespace: string) => {
    try {
      await deleteVCluster(name, namespace)
    } catch {
      // deleteVCluster handles errors internally; ignore unexpected throws
    }
  }

  const handleConnectVCluster = async (name: string, namespace: string) => {
    try {
      await connectVCluster(name, namespace)
    } catch {
      // connectVCluster handles errors internally; ignore unexpected throws
    }
  }

  const handleDisconnectVCluster = async (name: string, namespace: string) => {
    try {
      await disconnectVCluster(name, namespace)
    } catch {
      // disconnectVCluster handles errors internally; ignore unexpected throws
    }
  }

  // Client mission: install vCluster CLI locally
  const handleInstallVClusterCLI = () => {
    checkKeyAndRun(() => {
      startMission({
        title: 'Install vCluster CLI',
        description: 'Install the vCluster CLI tool on this machine',
        type: 'deploy',
        initialPrompt: 'Install the vCluster CLI tool on the local machine. Try using homebrew first (brew install loft-sh/tap/vcluster), and if that is not available, use the official install script: curl -L -o vcluster "https://github.com/loft-sh/vcluster/releases/latest/download/vcluster-$(uname -s)-$(uname -m)" && sudo install -c -m 0755 vcluster /usr/local/bin && rm -f vcluster. Verify the installation by running vcluster --version. After installation, ask: "vCluster CLI is installed — want to deploy it to a cluster?" or "Something went wrong — want to see details?"',
      })
    })
  }

  // Cluster mission: deploy vCluster operator to a specific host cluster
  const handleInstallVClusterOnCluster = (clusterContext: string) => {
    const displayName = (healthyClusters || []).find(c => (c.context || c.name) === clusterContext)?.name || clusterContext
    checkKeyAndRun(() => {
      startMission({
        title: `Deploy vCluster to ${displayName}`,
        description: `Install the vCluster operator on ${displayName} using Helm`,
        type: 'deploy',
        cluster: clusterContext,
        initialPrompt: `Deploy the vCluster operator to cluster "${displayName}" (context: ${clusterContext}) using Helm.

IMPORTANT: All kubectl and helm commands MUST use --context=${clusterContext}

Steps:
1. Verify connectivity: kubectl --context=${clusterContext} cluster-info
2. Add the Loft Helm repo: helm repo add loft-sh https://charts.loft.sh && helm repo update
3. Install the vCluster Helm chart: helm upgrade --install vcluster loft-sh/vcluster --namespace vcluster --create-namespace --kube-context=${clusterContext}
4. Wait for readiness: kubectl --context=${clusterContext} -n vcluster wait --for=condition=ready pod -l app=vcluster --timeout=120s
5. Verify the installation: kubectl --context=${clusterContext} get pods -n vcluster

After installation, ask:
- "vCluster operator is ready — want me to create and connect a virtual cluster now?"
- "Something went wrong — want to see details?"

If I say yes, do not stop after creation:
6. Create the virtual cluster on host context ${clusterContext}.
7. Connect it so kubeconfig gets a usable vCluster context without replacing the current host context.
8. Verify the vCluster context is reachable and visible to the Console cluster list.
`,
      })
    })
  }

  // Cluster mission: deploy KubeVirt operator to a specific host cluster
  const handleInstallKubeVirtOnCluster = (clusterContext: string) => {
    const displayName = (healthyClusters || []).find(c => (c.context || c.name) === clusterContext)?.name || clusterContext
    checkKeyAndRun(() => {
      startMission({
        title: `Install KubeVirt on ${displayName}`,
        description: `Install the KubeVirt operator on ${displayName}`,
        type: 'deploy',
        cluster: clusterContext,
        initialPrompt: `Install KubeVirt on cluster "${displayName}" (context: ${clusterContext}).

IMPORTANT: All kubectl commands MUST use --context=${clusterContext}

Steps:
1. Verify connectivity: kubectl --context=${clusterContext} cluster-info
2. Get the latest KubeVirt release version: export KUBEVIRT_VERSION=$(curl -s https://api.github.com/repos/kubevirt/kubevirt/releases/latest | grep tag_name | cut -d '"' -f 4)
3. Deploy the KubeVirt operator: kubectl --context=${clusterContext} apply -f https://github.com/kubevirt/kubevirt/releases/download/\${KUBEVIRT_VERSION}/kubevirt-operator.yaml
4. Deploy the KubeVirt custom resource: kubectl --context=${clusterContext} apply -f https://github.com/kubevirt/kubevirt/releases/download/\${KUBEVIRT_VERSION}/kubevirt-cr.yaml
5. Wait for KubeVirt to be ready: kubectl --context=${clusterContext} -n kubevirt wait kv kubevirt --for condition=Available --timeout=300s
6. Verify the installation: kubectl --context=${clusterContext} get pods -n kubevirt

After installation, ask:
- "KubeVirt is ready — want to create a VM?"
- "Something went wrong — want to see details?"`,
      })
    })
  }

  // Get icon for tool
  const getToolIcon = (tool: string) => {
    switch (tool) {
      case 'kind':
        return '🐳'
      case 'k3d':
        return '🚀'
      case 'minikube':
        return '📦'
      case 'vcluster':
        return '🔮'
      default:
        return '☸️'
    }
  }

  // Get description for tool
  const getToolDescription = (tool: string) => {
    switch (tool) {
      case 'kind':
        return 'Kubernetes in Docker - fast local clusters'
      case 'k3d':
        return 'k3s in Docker - lightweight Kubernetes'
      case 'minikube':
        return 'Local Kubernetes with multiple drivers'
      case 'vcluster':
        return 'Virtual clusters inside existing Kubernetes clusters'
      default:
        return 'Local Kubernetes cluster'
    }
  }

  return (
    <div id="local-clusters-settings" className="glass rounded-xl p-6">
      {/* Demo Mode Banner - only show when agent is disconnected */}
      {isDemoMode && !isConnected && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-center gap-2 text-yellow-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">Demo Mode</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Showing sample local clusters. Connect the kc-agent to manage real local clusters.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${(isConnected || isDemoMode) && installedTools.length > 0 ? 'bg-purple-500/20' : 'bg-secondary'}`}>
            <Container className={`w-5 h-5 ${(isConnected || isDemoMode) && installedTools.length > 0 ? 'text-purple-400' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">{t('settings.localClusters.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('settings.localClusters.subtitle')}</p>
          </div>
        </div>
        {(isConnected || isDemoMode) && (
          <Button
            variant="ghost"
            size="md"
            icon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={refresh}
            disabled={isLoading}
          >
            Refresh
          </Button>
        )}
      </div>

      {/* Not Connected State */}
      {!isConnected && !isDemoMode && (
        <div className="p-4 rounded-lg bg-secondary/50 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="w-5 h-5" />
            <span>{t('settings.localClusters.connectAgent')}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('settings.localClusters.agentDesc')}
          </p>
        </div>
      )}

      {/* Connected or Demo - No Tools Found */}
      {(isConnected || isDemoMode) && installedTools.length === 0 && (
        <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <div className="flex items-center gap-2 text-orange-400">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">{t('settings.localClusters.noToolsDetected')}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('settings.localClusters.installTools')}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li><code className="px-1 bg-secondary rounded">brew install kind</code> - Kubernetes in Docker</li>
            <li><code className="px-1 bg-secondary rounded">brew install k3d</code> - k3s in Docker</li>
            <li><code className="px-1 bg-secondary rounded">brew install minikube</code> - Local VM/container clusters</li>
          </ul>
        </div>
      )}

      {/* Connected or Demo - Tools Available */}
      {(isConnected || isDemoMode) && installedTools.length > 0 && (
        <>
          {/* Detected Tools */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('settings.localClusters.detectedTools')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {localClusterTools.map((tool) => (
                <div
                  key={tool.name}
                  className="p-3 rounded-lg bg-secondary/30 border border-border"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getToolIcon(tool.name)}</span>
                    <div>
                      <p className="font-medium text-foreground">{tool.name}</p>
                      <p className="text-xs text-muted-foreground">v{tool.version}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Create Cluster Form */}
          <div className="mb-6 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {t('settings.localClusters.createNew')}
            </h3>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 w-full">
              <select
                aria-label={t('settings.localClusters.selectTool')}
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value)}
                className="min-w-0 sm:w-auto sm:max-w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50 truncate"
              >
                <option value="">{t('settings.localClusters.selectTool')}</option>
                {localClusterTools.map((tool) => (
                  <option key={tool.name} value={tool.name}>
                    {getToolIcon(tool.name)} {tool.name} - {getToolDescription(tool.name)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label={t('settings.localClusters.clusterName', 'Cluster name')}
                value={clusterName}
                onChange={(e) => setClusterName(e.target.value)}
                placeholder="Cluster name"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
              />
              <button
                onClick={handleCreate}
                disabled={!selectedTool || !clusterName.trim() || isCreating}
                className="shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('settings.localClusters.creating')}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    {t('settings.localClusters.create')}
                  </>
                )}
              </button>
            </div>
            {/* Real-time progress banner (replaces static createMessage) */}
            <div className="mt-3">
              <ClusterProgressBanner
                progress={clusterProgress}
                onDismiss={dismissProgress}
              />
            </div>
          </div>

          {/* Existing Clusters */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              {t('settings.localClusters.localClustersCount', { count: clusters.length })}
            </h3>
            {clusters.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 bg-secondary/30 rounded-lg">
                {t('settings.localClusters.noClusters')}
              </p>
            ) : (
              <div className="space-y-2">
                {clusters.map((cluster) => {
                  const isRunning = cluster.status === 'running'
                  const isStopped = cluster.status === 'stopped'

                  return (
                    <div
                      key={`${cluster.tool}-${cluster.name}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getToolIcon(cluster.tool)}</span>
                        <div>
                          <p className="font-medium text-foreground">{cluster.name}</p>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">{cluster.tool}</span>
                            <span className="text-muted-foreground">•</span>
                            <div className="flex items-center gap-1.5">
                              <div className={`w-1.5 h-1.5 rounded-full ${
                                isRunning ? 'bg-green-500' :
                                isStopped ? 'bg-gray-500 dark:bg-gray-400' :
                                'bg-orange-500'
                              }`} />
                              <span className={
                                isRunning ? 'text-green-400' :
                                isStopped ? 'text-muted-foreground' :
                                'text-orange-400'
                              }>
                                {cluster.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setDeleteClusterConfirm({ tool: cluster.tool, name: cluster.name })}
                        disabled={isDeleting === cluster.name}
                        aria-label={t('settings.localClusters.deleteCluster', { name: cluster.name, defaultValue: `Delete cluster ${cluster.name}` })}
                        className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        title="Delete cluster"
                      >
                        {isDeleting === cluster.name ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ------------------------------------------------------------------ */}
          {/* vCluster Section                                                    */}
          {/* ------------------------------------------------------------------ */}

          {/* vCluster Install CTA — shown when vcluster CLI is not detected */}
          {!hasVClusterTool && (
            <div className="mt-6 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-center gap-2 text-purple-400 mb-2">
                <span className="text-xl">🔮</span>
                <span className="font-medium">{t('settings.localClusters.vclusterInstallTitle')}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {t('settings.localClusters.vclusterInstallDesc')}
              </p>
              <ul className="mb-3 space-y-1 text-sm text-muted-foreground">
                <li><code className="px-1 bg-secondary rounded">brew install loft-sh/tap/vcluster</code></li>
                <li><code className="px-1 bg-secondary rounded">curl -L -o vcluster https://github.com/loft-sh/vcluster/releases/latest/download/vcluster-...</code></li>
              </ul>
              <button
                onClick={handleInstallVClusterCLI}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
              >
                <Bot className="w-4 h-4" />
                {t('settings.localClusters.vclusterInstallWithAgent')}
              </button>
            </div>
          )}

          {/* vCluster instances and create form — shown when vcluster CLI is detected */}
          {hasVClusterTool && (
            <div className="mt-6">
              {/* Section header */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">🔮</span>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('settings.localClusters.vclusterSection')}
                </h3>
                <span className="text-xs text-muted-foreground">
                  — {t('settings.localClusters.vclusterDesc')}
                </span>
              </div>

              <VClusterActionBanner
                feedback={vclusterActionFeedback}
                onDismiss={dismissVClusterActionFeedback}
              />

              {/* Create vCluster Form */}
              <div className="mb-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {t('settings.localClusters.vclusterCreateNew')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="vcluster-host-cluster" className="text-xs text-muted-foreground font-medium">Host Cluster</label>
                    <select
                      id="vcluster-host-cluster"
                      value={vclusterHostCluster}
                      onChange={(e) => { setVclusterHostCluster(e.target.value); if (e.target.value) checkVClusterOnCluster(e.target.value) }}
                      className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
                    >
                      <option value="" disabled>{t('settings.localClusters.selectHostCluster')}</option>
                      {(healthyClusters || []).map(c => {
                        const vcStatus = (vclusterClusterStatus || []).find(s => s.context === (c.context || c.name))
                        const hasVC = vcStatus?.hasCRD
                        return (
                          <option key={c.context || c.name} value={c.context || c.name}>
                            {c.name}{hasVC ? ` (🔮 v${vcStatus?.version || '?'}, ${vcStatus?.instances || 0} instances)` : ''}{c.context && c.context !== c.name ? ` — ${c.context}` : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 justify-end">
                    {(() => {
                      const vcStatus = (vclusterClusterStatus || []).find(s => s.context === vclusterHostCluster)
                      const displayName = (healthyClusters || []).find(c => (c.context || c.name) === vclusterHostCluster)?.name || vclusterHostCluster
                      if (vcStatus?.hasCRD) {
                        return (
                          <span className="flex items-center gap-2 px-3 py-2 text-xs text-purple-400 font-medium">
                            🔮 vCluster v{vcStatus.version || '?'} ready ({vcStatus.instances} instance{vcStatus.instances !== 1 ? 's' : ''})
                          </span>
                        )
                      }
                      return (
                        <button
                          onClick={() => handleInstallVClusterOnCluster(vclusterHostCluster)}
                          disabled={!vclusterHostCluster}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/20 text-orange-400 text-xs font-medium hover:bg-orange-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Bot className="w-3.5 h-3.5" />
                          {vclusterHostCluster ? `Deploy vCluster to ${displayName}` : 'Select a cluster first'}
                        </button>
                      )
                    })()}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="vcluster-namespace" className="text-xs text-muted-foreground font-medium">Namespace</label>
                    <input
                      id="vcluster-namespace"
                      type="text"
                      value={vclusterNamespace}
                      onChange={(e) => setVclusterNamespace(e.target.value)}
                      placeholder={t('settings.localClusters.vclusterDefaultNamespace')}
                      className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="vcluster-name" className="text-xs text-muted-foreground font-medium">vCluster Name</label>
                    <input
                      id="vcluster-name"
                      type="text"
                      value={vclusterName}
                      onChange={(e) => setVclusterName(e.target.value)}
                      placeholder="my-vcluster"
                      className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleCreateVCluster}
                      disabled={!vclusterName.trim() || !vclusterHostCluster || isCreating}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t('settings.localClusters.creating')}
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          {t('settings.localClusters.create')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* vCluster Instances List */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  {t('settings.localClusters.vclusterCount', { count: (vclusterInstances || []).length })}
                </h3>
                {(vclusterInstances || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 bg-secondary/30 rounded-lg">
                    {t('settings.localClusters.noClusters')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(vclusterInstances || []).map((instance) => {
                      const isRunning = instance.status === 'Running'
                      const isPaused = instance.status === 'Paused'

                      return (
                        <div
                          key={`vcluster-${instance.namespace}-${instance.name}`}
                          className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">🔮</span>
                            <div>
                              <p className="font-medium text-foreground">{instance.name}</p>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">
                                  {t('settings.localClusters.vclusterNamespace')}: {instance.namespace}
                                </span>
                                <span className="text-muted-foreground">•</span>
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${
                                    isRunning ? 'bg-green-500' :
                                    isPaused ? 'bg-yellow-500' :
                                    'bg-orange-500'
                                  }`} />
                                  <span className={
                                    isRunning ? 'text-green-400' :
                                    isPaused ? 'text-yellow-400' :
                                    'text-orange-400'
                                  }>
                                    {isPaused ? t('settings.localClusters.vclusterPaused') : instance.status}
                                  </span>
                                </div>
                                {instance.connected && (
                                  <>
                                    <span className="text-muted-foreground">•</span>
                                    <span className="text-green-400 flex items-center gap-1">
                                      <Plug className="w-3 h-3" />
                                      {t('settings.localClusters.vclusterConnected')}
                                    </span>
                                  </>
                                )}
                                {instance.connected && instance.context && (
                                  <>
                                    <span className="text-muted-foreground">•</span>
                                    <code className="px-1 bg-secondary rounded text-muted-foreground">{instance.context}</code>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {/* Connect / Disconnect button */}
                            {instance.connected ? (
                              <button
                                onClick={() => handleDisconnectVCluster(instance.name, instance.namespace)}
                                disabled={isDisconnecting === instance.name}
                                aria-label={t('settings.localClusters.vclusterDisconnect')}
                                className="p-2 rounded-lg text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10 disabled:opacity-50"
                                title={t('settings.localClusters.vclusterDisconnect')}
                              >
                                {isDisconnecting === instance.name ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Unplug className="w-4 h-4" />
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleConnectVCluster(instance.name, instance.namespace)}
                                disabled={isConnecting === instance.name}
                                aria-label={t('settings.localClusters.vclusterConnect')}
                                className="p-2 rounded-lg text-muted-foreground hover:text-green-400 hover:bg-green-500/10 disabled:opacity-50"
                                title={t('settings.localClusters.vclusterConnect')}
                              >
                                {isConnecting === instance.name ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Plug className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            {/* Delete button */}
                            <button
                              onClick={() => setDeleteVClusterConfirm({ name: instance.name, namespace: instance.namespace })}
                              disabled={isDeleting === instance.name}
                              aria-label={t('settings.localClusters.deleteVcluster', { name: instance.name, defaultValue: `Delete vCluster ${instance.name}` })}
                              className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                              title="Delete vCluster"
                            >
                              {isDeleting === instance.name ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* KubeVirt Section                                                    */}
          {/* ------------------------------------------------------------------ */}
          <div className="mt-6">
            {/* Section header */}
            <div className="flex items-center gap-2 mb-4">
              <Monitor className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('settings.localClusters.kubevirtSection')}
              </h3>
              <span className="text-xs text-muted-foreground">
                — {t('settings.localClusters.kubevirtDesc')}
              </span>
            </div>

            {/* Per-cluster KubeVirt status */}
            {healthyClusters.length > 0 ? (
              <div className="space-y-2 mb-4">
                {(healthyClusters || []).map(c => {
                  const context = c.context || c.name
                  const hasKubevirt = (c.namespaces || []).includes(KUBEVIRT_NAMESPACE)

                  return (
                    <div
                      key={`kubevirt-${context}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <Monitor className="w-4 h-4 text-cyan-400" />
                        <div>
                          <p className="font-medium text-foreground">{c.name}</p>
                          <div className="flex items-center gap-2 text-xs">
                            {c.context && c.context !== c.name && (
                              <>
                                <code className="px-1 bg-secondary rounded text-muted-foreground">{c.context}</code>
                                <span className="text-muted-foreground">•</span>
                              </>
                            )}
                            <div className="flex items-center gap-1.5">
                              <div className={`w-1.5 h-1.5 rounded-full ${hasKubevirt ? 'bg-green-500' : 'bg-gray-500'}`} />
                              <span className={hasKubevirt ? 'text-green-400' : 'text-muted-foreground'}>
                                {hasKubevirt
                                  ? t('settings.localClusters.kubevirtInstalled')
                                  : t('settings.localClusters.kubevirtNotInstalled')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      {!hasKubevirt && (
                        <button
                          onClick={() => handleInstallKubeVirtOnCluster(context)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-medium hover:bg-cyan-500/30 transition-colors"
                        >
                          <Bot className="w-3.5 h-3.5" />
                          {t('settings.localClusters.kubevirtInstallOnCluster')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground p-4 bg-secondary/30 rounded-lg mb-4">
                {t('settings.localClusters.kubevirtNoClusters')}
              </p>
            )}

            {/* Summary and mission link */}
            <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              {hasKubevirtAnywhere ? (
                <div className="flex items-center gap-2 text-cyan-400 mb-2">
                  <Check className="w-4 h-4" />
                  <span className="font-medium">
                    {t('settings.localClusters.kubevirtDetectedCount', { count: kubevirtClusters.length })}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-cyan-400 mb-2">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-medium">{t('settings.localClusters.kubevirtNotDetected')}</span>
                </div>
              )}
              <p className="text-sm text-muted-foreground mb-3">
                {t('settings.localClusters.kubevirtInstallHint')}
              </p>
              <button
                onClick={() => navigate(KUBEVIRT_MISSION_ROUTE)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                {t('settings.localClusters.kubevirtOpenMission')}
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              {friendlyErrorMessage(error)}
            </div>
          )}
        </>
      )}

      {/* API Key Prompt Modal for vCluster / KubeVirt install missions */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />

      <ConfirmDialog
        isOpen={deleteClusterConfirm !== null}
        onClose={() => setDeleteClusterConfirm(null)}
        onConfirm={() => {
          if (deleteClusterConfirm) {
            handleDelete(deleteClusterConfirm.tool, deleteClusterConfirm.name)
            setDeleteClusterConfirm(null)
          }
        }}
        title={t('actions.delete')}
        message={t('settings.localClusters.deleteConfirm', { name: deleteClusterConfirm?.name ?? '' })}
        confirmLabel={t('actions.delete')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={deleteVClusterConfirm !== null}
        onClose={() => setDeleteVClusterConfirm(null)}
        onConfirm={() => {
          if (deleteVClusterConfirm) {
            handleDeleteVCluster(deleteVClusterConfirm.name, deleteVClusterConfirm.namespace)
            setDeleteVClusterConfirm(null)
          }
        }}
        title={t('actions.delete')}
        message={t('settings.localClusters.vclusterDeleteConfirm', { name: deleteVClusterConfirm?.name ?? '', namespace: deleteVClusterConfirm?.namespace ?? '' })}
        confirmLabel={t('actions.delete')}
        variant="danger"
      />
    </div>
  )
}
