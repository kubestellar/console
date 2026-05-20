import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Loader2 } from 'lucide-react'
import { ClusterProgressBanner } from './ClusterProgressBanner'
import type { ClusterProgress } from '../../../../hooks/useClusterProgress'

interface ToolInfo {
  name: string
  version: string
}

interface ClusterAddFormProps {
  installedTools: ToolInfo[]
  isCreating: boolean
  clusterProgress: ClusterProgress | null
  clusterProgressIsStale: boolean
  dismissProgress: () => void
  onCreateCluster: (tool: string, name: string) => Promise<void>
}

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

export function ClusterAddForm({
  installedTools,
  isCreating,
  clusterProgress,
  clusterProgressIsStale,
  dismissProgress,
  onCreateCluster,
}: ClusterAddFormProps) {
  const { t } = useTranslation()
  const [selectedTool, setSelectedTool] = useState<string>('')
  const [clusterName, setClusterName] = useState('')

  // Filter out vcluster (has its own section)
  const localClusterTools = installedTools.filter(t => t.name !== 'vcluster')

  const handleCreate = async () => {
    if (!selectedTool || !clusterName.trim()) return
    await onCreateCluster(selectedTool, clusterName.trim())
    setClusterName('')
  }

  return (
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
      {/* Real-time progress banner */}
      <div className="mt-3">
        <ClusterProgressBanner
          progress={clusterProgress}
          onDismiss={dismissProgress}
          isStale={clusterProgressIsStale}
        />
      </div>
    </div>
  )
}
