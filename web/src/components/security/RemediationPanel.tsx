import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface RemediationPanelProps {
  refreshError: string | null
  handleRefresh: () => void
}

export function RemediationPanel({ refreshError, handleRefresh }: RemediationPanelProps) {
  const { t } = useTranslation('cards')
  const { t: tc } = useTranslation()

  if (!refreshError) return null

  return (
    <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">{t('security.refreshFailed')}</p>
        <p className="text-sm text-red-300/80">{refreshError}</p>
      </div>
      <button
        onClick={handleRefresh}
        className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium transition-colors"
      >
        {tc('common.retry')}
      </button>
    </div>
  )
}
