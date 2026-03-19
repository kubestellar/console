import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Container, RefreshCw, Plus, Trash2, Check, AlertCircle, AlertTriangle, Loader2, X, Plug, Unplug, Bot } from 'lucide-react'
import { Button } from '../../ui/Button'
import { useLocalClusterTools } from '../../../hooks/useLocalClusterTools'
import { CLUSTER_PROGRESS_AUTO_DISMISS_MS } from '../../../hooks/useClusterProgress'
import { emitLocalClusterCreated } from '../../../lib/analytics'
import { useMissions } from '../../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../../cards/console-missions/shared'
import { useClusters } from '../../../hooks/mcp/clusters'
import type { ClusterProgress } from '../../../hooks/useClusterProgress'

/** Default namespace for new vCluster instances */
const VCLUSTER_DEFAULT_NAMESPACE = 'vcluster'

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
    >
      {isActive && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {isDone && <Check className="w-4 h-4 shrink-0" />}
      {isFailed && <AlertTriangle className="w-4 h-4 shrink-0" />}

      <span className="flex-1">{progress.message}</span>

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
        aria-label="Dismiss"
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

  const { clusters: connectedClusters } = useClusters()
  const healthyClusters = (connectedClusters || []).filter(c => c.healthy !== false)

  const hasVClusterTool = installedTools.some(t => t.name === 'vcluster')
  /** Local cluster tools excluding vcluster (vcluster has its own section) */
  const localClusterTools = installedTools.filter(t => t.name !== 'vcluster')

  const handleCreate = async () => {
    if (!selectedTool || !clusterName.trim()) return

    const result = await createCluster(selectedTool, clusterName.trim())
    emitLocalClusterCreated(selectedTool)

    if (result.status === 'creating') {
      setClusterName('')
      // Real-time progress is now handled by ClusterProgressBanner via WebSocket
    }
  }

  const handleDelete = async (tool: string, name: string) => {
    if (!confirm(t('settings.localClusters.deleteConfirm', { name }))) return
    await deleteCluster(tool, name)
  }

  const handleCreateVCluster = async () => {
    if (!vclusterName.trim()) return

    const result = await createVCluster(vclusterName.trim(), vclusterNamespace.trim() || VCLUSTER_DEFAULT_NAMESPACE)
    emitLocalClusterCreated('vcluster')

    if (result.status === 'creating') {
      setVclusterName('')
      setVclusterNamespace(VCLUSTER_DEFAULT_NAMESPACE)
    }
  }

  const handleDeleteVCluster = async (name: string, namespace: string) => {
    if (!confirm(t('settings.localClusters.vclusterDeleteConfirm', { name, namespace }))) return
    await deleteVCluster(name, namespace)
  }

  // Client mission: install vCluster CLI locally
  const handleInstallVClusterCLI = () => {
    checkKeyAndRun(() => {
      startMission({
        title: 'Install vCluster CLI',
        description: 'Install the vCluster CLI tool on this machine',
        type: 'deploy',
        initialPrompt: 'Install the vCluster CLI tool on the local machine. Try using homebrew first (brew install loft-sh/tap/vcluster), and if that is not available, use the official install script: curl -L -o vcluster "https://github.com/loft-sh/vcluster/releases/latest/download/vcluster-$(uname -s)-$(uname -m)" && sudo install -c -m 0755 vcluster /usr/local/bin && rm -f vcluster. Verify the installation by running vcluster --version.',
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

After installation, the user can create virtual clusters on this host cluster from the console settings page.`,
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
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value)}
                className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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
                value={clusterName}
                onChange={(e) => setClusterName(e.target.value)}
                placeholder="Cluster name"
                className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
              <button
                onClick={handleCreate}
                disabled={!selectedTool || !clusterName.trim() || isCreating}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                isStopped ? 'bg-gray-500' : 
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
                        onClick={() => handleDelete(cluster.tool, cluster.name)}
                        disabled={isDeleting === cluster.name}
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

              {/* Create vCluster Form */}
              <div className="mb-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {t('settings.localClusters.vclusterCreateNew')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground font-medium">Host Cluster</label>
                    <select
                      value={vclusterHostCluster}
                      onChange={(e) => { setVclusterHostCluster(e.target.value); if (e.target.value) checkVClusterOnCluster(e.target.value) }}
                      className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    >
                      <option value="" disabled>Select a host cluster...</option>
                      {(healthyClusters || []).map(c => {
                        const vcStatus = (vclusterClusterStatus || []).find(s => s.context === (c.context || c.name))
                        const hasVC = vcStatus?.hasCRD
                        return (
                          <option key={c.context || c.name} value={c.context || c.name}>
                            {hasVC ? '🔮 ' : ''}{c.name}{hasVC ? ` (🔮 v${vcStatus?.version || '?'}, ${vcStatus?.instances || 0} instances)` : ''}{c.context && c.context !== c.name ? ` — ${c.context}` : ''}
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
                    <label className="text-xs text-muted-foreground font-medium">Namespace</label>
                    <input
                      type="text"
                      value={vclusterNamespace}
                      onChange={(e) => setVclusterNamespace(e.target.value)}
                      placeholder={t('settings.localClusters.vclusterDefaultNamespace')}
                      className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground font-medium">vCluster Name</label>
                    <input
                      type="text"
                      value={vclusterName}
                      onChange={(e) => setVclusterName(e.target.value)}
                      placeholder="my-vcluster"
                      className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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
                                onClick={() => disconnectVCluster(instance.name, instance.namespace)}
                                disabled={isDisconnecting === instance.name}
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
                                onClick={() => connectVCluster(instance.name, instance.namespace)}
                                disabled={isConnecting === instance.name}
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
                              onClick={() => handleDeleteVCluster(instance.name, instance.namespace)}
                              disabled={isDeleting === instance.name}
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

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              {error}
            </div>
          )}
        </>
      )}

      {/* API Key Prompt Modal for vCluster install mission */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />
    </div>
  )
}
