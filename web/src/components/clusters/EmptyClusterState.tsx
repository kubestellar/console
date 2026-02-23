import { Server, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface EmptyClusterStateProps {
  onAddCluster: () => void
}

export function EmptyClusterState({ onAddCluster }: EmptyClusterStateProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Server className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {t('cluster.noClusterTitle')}
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        {t('cluster.noClusterDesc')}
      </p>
      <button
        onClick={onAddCluster}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
      >
        <Plus className="w-4 h-4" />
        {t('cluster.addCluster')}
      </button>
    </div>
  )
}
