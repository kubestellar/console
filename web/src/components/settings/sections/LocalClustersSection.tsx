import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Container, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '../../ui/Button'
import { friendlyErrorMessage } from '../../../lib/clusterErrors'
import { ConfirmDialog } from '../../../lib/modals'
import { ApiKeyPromptModal } from '../../cards/console-missions/shared'
import { ClusterRow } from './ClusterRow'
import { AddClusterForm } from './AddClusterForm'
import { ImportWizard } from './ImportWizard'
import { VClusterSection, KubeVirtSection } from './LocalClustersSection.parts'
import { useLocalClusters } from './useLocalClusters'

/** Deep-link route for the KubeVirt install mission in console-kb */
const KUBEVIRT_MISSION_ROUTE = '/missions/install-kubevirt'

function getToolIcon(tool: string) {
  switch (tool) {
    case 'kind': return '🐳'
    case 'k3d': return '🚀'
    case 'minikube': return '📦'
    case 'vcluster': return '🔮'
    default: return '☸️'
  }
}

function getToolDescription(tool: string) {
  switch (tool) {
    case 'kind': return 'Kubernetes in Docker - fast local clusters'
    case 'k3d': return 'k3s in Docker - lightweight Kubernetes'
    case 'minikube': return 'Local Kubernetes with multiple drivers'
    case 'vcluster': return 'Virtual clusters inside existing Kubernetes clusters'
    default: return 'Local Kubernetes cluster'
  }
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
    clusterProgressIsStale,
    dismissProgress,
    refresh,
    vclusterInstances,
    vclusterClusterStatus,
    isConnecting,
    isDisconnecting,
    vclusterActionFeedback,
    dismissVClusterActionFeedback,
    healthyClusters,
    hasVClusterTool,
    localClusterTools,
    selectedTool,
    setSelectedTool,
    clusterName,
    setClusterName,
    vclusterName,
    setVclusterName,
    vclusterNamespace,
    setVclusterNamespace,
    vclusterHostCluster,
    deleteClusterConfirm,
    setDeleteClusterConfirm,
    deleteVClusterConfirm,
    setDeleteVClusterConfirm,
    showKeyPrompt,
    goToSettings,
    dismissPrompt,
    handleCreate,
    handleDelete,
    handleCreateVCluster,
    handleDeleteVCluster,
    handleConnectVCluster,
    handleDisconnectVCluster,
    handleSetVclusterHostCluster,
    handleInstallVClusterCLI,
    handleInstallVClusterOnCluster,
    handleInstallKubeVirtOnCluster,
  } = useLocalClusters()

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
      {(isConnected || isDemoMode) && installedTools.length === 0 && <ImportWizard t={t} />}

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
                      <p className="text-xs text-muted-foreground">v{tool.version ?? "?"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AddClusterForm
            localClusterTools={localClusterTools}
            selectedTool={selectedTool}
            clusterName={clusterName}
            isCreating={isCreating}
            clusterProgress={clusterProgress}
            clusterProgressIsStale={clusterProgressIsStale}
            getToolIcon={getToolIcon}
            getToolDescription={getToolDescription}
            onSelectedToolChange={setSelectedTool}
            onClusterNameChange={setClusterName}
            onCreate={handleCreate}
            onDismissProgress={dismissProgress}
            t={t}
          />

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
                {clusters.map((cluster) => (
                  <ClusterRow
                    key={`${cluster.tool}-${cluster.name}`}
                    cluster={cluster}
                    isDeleting={isDeleting}
                    getToolIcon={getToolIcon}
                    onDeleteRequest={setDeleteClusterConfirm}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>

          <VClusterSection
            hasVClusterTool={hasVClusterTool}
            vclusterHostCluster={vclusterHostCluster}
            onSetVclusterHostCluster={handleSetVclusterHostCluster}
            vclusterNamespace={vclusterNamespace}
            setVclusterNamespace={setVclusterNamespace}
            vclusterName={vclusterName}
            setVclusterName={setVclusterName}
            healthyClusters={healthyClusters}
            vclusterInstances={vclusterInstances}
            vclusterClusterStatus={vclusterClusterStatus}
            vclusterActionFeedback={vclusterActionFeedback}
            dismissVClusterActionFeedback={dismissVClusterActionFeedback}
            isCreating={isCreating}
            isConnecting={isConnecting}
            isDisconnecting={isDisconnecting}
            isDeleting={isDeleting}
            onCreateVCluster={handleCreateVCluster}
            onConnectVCluster={handleConnectVCluster}
            onDisconnectVCluster={handleDisconnectVCluster}
            onDeleteVClusterRequest={setDeleteVClusterConfirm}
            onInstallVClusterCLI={handleInstallVClusterCLI}
            onInstallVClusterOnCluster={handleInstallVClusterOnCluster}
            t={t}
          />

          <KubeVirtSection
            healthyClusters={healthyClusters}
            onInstallKubeVirtOnCluster={handleInstallKubeVirtOnCluster}
            onNavigateToMission={() => navigate(KUBEVIRT_MISSION_ROUTE)}
            t={t}
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
