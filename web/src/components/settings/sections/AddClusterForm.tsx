import { Loader2, Plus } from 'lucide-react'
import type { ComponentProps } from 'react'
import type { TFunction } from 'i18next'
import { ClusterProgressBanner } from './ClusterProgressBanner'

interface ToolInfo {
  name: string
  version: string | undefined
}

type ClusterProgress = ComponentProps<typeof ClusterProgressBanner>['progress']

interface AddClusterFormProps {
  localClusterTools: ToolInfo[]
  selectedTool: string
  clusterName: string
  isCreating: boolean
  clusterProgress: ClusterProgress
  clusterProgressIsStale: boolean
  getToolIcon: (tool: string) => string
  getToolDescription: (tool: string) => string
  onSelectedToolChange: (value: string) => void
  onClusterNameChange: (value: string) => void
  onCreate: () => void
  onDismissProgress: () => void
  t: TFunction
}

export function AddClusterForm({
  localClusterTools,
  selectedTool,
  clusterName,
  isCreating,
  clusterProgress,
  clusterProgressIsStale,
  getToolIcon,
  getToolDescription,
  onSelectedToolChange,
  onClusterNameChange,
  onCreate,
  onDismissProgress,
  t,
}: AddClusterFormProps) {
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
          onChange={(e) => onSelectedToolChange(e.target.value)}
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
          onChange={(e) => onClusterNameChange(e.target.value)}
          placeholder="Cluster name"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
        />
        <button
          onClick={onCreate}
          disabled={!selectedTool || !clusterName.trim() || isCreating}
          className="shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="mt-3">
        <ClusterProgressBanner
          progress={clusterProgress}
          onDismiss={onDismissProgress}
          isStale={clusterProgressIsStale}
        />
      </div>
    </div>
  )
}
