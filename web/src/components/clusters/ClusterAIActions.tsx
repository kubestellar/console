import { Bot, Stethoscope, Wrench, Wand2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { Button } from '../ui/Button'

interface ClusterAIActionsProps {
  isUnreachable: boolean
  podIssuesCount: number
  deploymentIssuesCount: number
  onDiagnose: () => void
  onRepair: () => void
  onAsk: () => void
}

export function ClusterAIActions({ isUnreachable, podIssuesCount, deploymentIssuesCount, onDiagnose, onRepair, onAsk }: ClusterAIActionsProps) {
  const { t } = useTranslation()
  const totalIssues = podIssuesCount + deploymentIssuesCount

  return (
    <div className="mb-6 p-4 rounded-lg bg-linear-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-5 h-5 text-purple-400" />
        <span className="text-sm font-medium text-foreground">{t('clusterDetail.aiAssistant')}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onDiagnose}
          disabled={isUnreachable}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('clusterDetail.diagnoseTitle')}
        >
          <Stethoscope className="w-3.5 h-3.5" />
          {t('clusterDetail.diagnose')}
        </button>
        <button
          onClick={onRepair}
          disabled={isUnreachable || totalIssues === 0}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={totalIssues === 0 ? t('clusterDetail.noIssuesToRepair') : t('clusterDetail.repairTitle')}
        >
          <Wrench className="w-3.5 h-3.5" />
          {t('clusterDetail.repair')}
          {totalIssues > 0 && (
            <StatusBadge color="red" size="xs">
              {totalIssues}
            </StatusBadge>
          )}
        </button>
        <Button
          variant="accent"
          size="sm"
          onClick={onAsk}
          disabled={isUnreachable}
          icon={<Wand2 className="w-3.5 h-3.5" />}
          title={t('clusterDetail.askTitle')}
        >
          {t('clusterDetail.ask')}
        </Button>
      </div>
    </div>
  )
}
