import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Container, RefreshCw, AlertCircle, Bot } from 'lucide-react'
import { Button } from '../../ui/Button'
import { useLocalClusterTools } from '../../../hooks/useLocalClusterTools'
import { emitLocalClusterCreated } from '../../../lib/analytics'
import { friendlyErrorMessage } from '../../../lib/clusterErrors'
import { useMissions } from '../../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../../cards/console-missions/shared'
import { useClusters } from '../../../hooks/mcp/clusters'
import { ConfirmDialog } from '../../../lib/modals'
import { ClusterAddForm } from './local-clusters/ClusterAddForm'
import { ClusterList } from './local-clusters/ClusterList'
import { VClusterSection } from './local-clusters/VClusterSection'
import { KubeVirtSection } from './local-clusters/KubeVirtSection'

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
    clusterProgressIsStale,
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

  // Delete confirmation state
  const [deleteClusterConfirm, setDeleteClusterConfirm] = useState<{ tool: string; name: string } | null>(null)
  const [deleteVClusterConfirm, setDeleteVClusterConfirm] = useState<{ name: string; namespace: string } | null>(null)

  const { deduplicatedClusters: connectedClusters } = useClusters()
  const healthyClusters = (connectedClusters || []).filter(c => c.healthy !== false)

  const hasVClusterTool = installedTools.some(t => t.name === 'vcluster')

  const handleCreateCluster = async (tool: string, name: string) => {
    try {
      const result = await createCluster(tool, name)
      emitLocalClusterCreated(tool)

      if (result.status === 'creating') {
        // Real-time progress is handled by ClusterScanStatus via WebSocket
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

  const handleDeleteVCluster = async (name: string, namespace: string) => {
    try {
      await deleteVCluster(name, namespace)
    } catch {
      // deleteVCluster handles errors internally; ignore unexpected throws
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
              {installedTools.filter(t => t.name !== 'vcluster').map((tool) => (
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
          <ClusterAddForm
            installedTools={installedTools}
            isCreating={isCreating}
            clusterProgress={clusterProgress}
            clusterProgressIsStale={clusterProgressIsStale}
            dismissProgress={dismissProgress}
            onCreateCluster={handleCreateCluster}
          />

          {/* Existing Clusters */}
          <ClusterList
            clusters={clusters}
            isDeleting={isDeleting}
            onDeleteCluster={(tool, name) => setDeleteClusterConfirm({ tool, name })}
          />

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
            <VClusterSection
              vclusterInstances={vclusterInstances}
              vclusterClusterStatus={vclusterClusterStatus}
              healthyClusters={healthyClusters}
              isCreating={isCreating}
              isConnecting={isConnecting}
              isDisconnecting={isDisconnecting}
              isDeleting={isDeleting}
              vclusterActionFeedback={vclusterActionFeedback}
              dismissVClusterActionFeedback={dismissVClusterActionFeedback}
              checkVClusterOnCluster={checkVClusterOnCluster}
              createVCluster={createVCluster}
              connectVCluster={connectVCluster}
              disconnectVCluster={disconnectVCluster}
              onDeleteVCluster={(name, namespace) => setDeleteVClusterConfirm({ name, namespace })}
              onInstallVClusterOnCluster={handleInstallVClusterOnCluster}
            />
          )}

          {/* KubeVirt Section */}
          <KubeVirtSection
            healthyClusters={healthyClusters}
            onInstallKubeVirtOnCluster={handleInstallKubeVirtOnCluster}
          />

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
