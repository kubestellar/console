import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Container, RefreshCw, Plus, Trash2, Check, AlertCircle, Loader2 } from 'lucide-react'
import { useLocalClusterTools } from '../../../hooks/useLocalClusterTools'

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
    createCluster,
    deleteCluster,
    refresh,
  } = useLocalClusterTools()

  const [selectedTool, setSelectedTool] = useState<string>('')
  const [clusterName, setClusterName] = useState('')
  const [createMessage, setCreateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleCreate = async () => {
    if (!selectedTool || !clusterName.trim()) return

    setCreateMessage(null)
    const result = await createCluster(selectedTool, clusterName.trim())

    if (result.status === 'creating') {
      setCreateMessage({ type: 'success', text: result.message })
      setClusterName('')
      // Refresh after a delay to pick up the new cluster
      setTimeout(() => refresh(), 5000)
    } else {
      setCreateMessage({ type: 'error', text: result.message })
    }
  }

  const handleDelete = async (tool: string, name: string) => {
    if (!confirm(t('settings.localClusters.deleteConfirm', { name }))) return
    await deleteCluster(tool, name)
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
          <button
            onClick={refresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
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
              {installedTools.map((tool) => (
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
                {installedTools.map((tool) => (
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
            {createMessage && (
              <div className={`mt-3 p-2 rounded text-sm ${
                createMessage.type === 'success'
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {createMessage.type === 'success' ? (
                  <Check className="w-4 h-4 inline mr-1" />
                ) : (
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                )}
                {createMessage.text}
              </div>
            )}
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
                                isStopped ? 'text-gray-400' : 
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

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              {error}
            </div>
          )}
        </>
      )}
    </div>
  )
}
