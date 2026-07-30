import { useTranslation } from 'react-i18next'
import { CheckCircle, WifiOff } from 'lucide-react'
import { cn } from '@/lib/cn'

type ConnectionStatus = 'connected' | 'offline'

interface DashboardEmptyStateProps {
  onAddCard: () => void
  onOpenTemplates: () => void
  connectionStatus?: ConnectionStatus
}

const CONNECTION_CONFIG = {
  connected: { icon: CheckCircle, color: 'text-green-400', label: 'dashboard.status.connected' },
  offline: { icon: WifiOff, color: 'text-red-400', label: 'dashboard.status.offline' },
} as const

export function DashboardEmptyState({ onAddCard, onOpenTemplates, connectionStatus }: DashboardEmptyStateProps) {
  const { t } = useTranslation()
  const statusConfig = connectionStatus ? CONNECTION_CONFIG[connectionStatus] : null
  const StatusIcon = statusConfig?.icon

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      {statusConfig && StatusIcon && (
        <div className={cn('inline-flex items-center gap-1.5 mb-4 text-xs', statusConfig.color)}>
          <StatusIcon className="w-3 h-3" />
          <span>{t(statusConfig.label)}</span>
        </div>
      )}
      <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      </div>
      <h2 className="text-lg font-medium text-foreground mb-2">{t('dashboard.empty.noCardsYet')}</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        {t('dashboard.empty.emptyDescription')}
      </p>
      <div className="flex gap-3">
        <button
          onClick={onAddCard}
          className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
        >
          {t('dashboard.empty.addCards')}
        </button>
        <button
          onClick={onOpenTemplates}
          className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
        >
          {t('dashboard.empty.startWithTemplate')}
        </button>
      </div>
    </div>
  )
}
