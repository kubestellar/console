import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../../lib/cn'

interface ClusterStatusPanelProps {
  showClusterStatus: boolean
  onToggle: () => void
}

export function ClusterStatusPanel({ showClusterStatus, onToggle }: ClusterStatusPanelProps) {
  const { t } = useTranslation(['common', 'cards'])

  return (
    <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{t('sidebar.customizer.clusterStatusPanel')}</h3>
          <p className="text-xs text-muted-foreground">{t('sidebar.customizer.showClusterHealth')}</p>
        </div>
        <button
          onClick={onToggle}
          className={cn(
            'p-2 rounded-lg transition-colors',
            showClusterStatus ? 'bg-green-500/20 text-green-400' : 'bg-secondary text-muted-foreground'
          )}
        >
          {showClusterStatus ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
        </button>
      </div>
    </div>
  )
}
