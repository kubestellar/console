import { Activity, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { COLOR_CLASSES } from '../../lib/stats/types'
import type { StatsDefinition } from '../../lib/stats/types'
import { StatusBadge } from '../ui/StatusBadge'
import { getIcon } from './statBlockFactoryModal.utils'

interface StatBlockManageTabProps {
  existingStats: StatsDefinition[]
  onDeleteRequest: (type: string) => void
}

export function StatBlockManageTab({ existingStats, onDeleteRequest }: StatBlockManageTabProps) {
  const { t } = useTranslation()

  if (existingStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Activity className="w-8 h-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">{t('dashboard.statFactory.noCustomStats')}</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {t('dashboard.statFactory.useBuildTab')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {existingStats.map(stats => (
        <div key={stats.type} className="rounded-lg bg-card/50 border border-border p-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-sm font-medium text-foreground">{stats.title || stats.type}</span>
              <StatusBadge color="purple" size="xs">
                {t('dashboard.statFactory.blocksCount', { count: stats.blocks.length })}
              </StatusBadge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Type: {stats.type}
            </p>
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {stats.blocks.slice(0, 8).map(block => {
                const BlockIcon = getIcon(block.icon)
                return (
                  <span
                    key={block.id}
                    className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground"
                  >
                    <BlockIcon className={cn('w-3 h-3', COLOR_CLASSES[block.color])} />
                    {block.label}
                  </span>
                )
              })}
              {stats.blocks.length > 8 && (
                <span className="text-xs px-1.5 py-0.5 text-muted-foreground">
                  +{stats.blocks.length - 8} more
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onDeleteRequest(stats.type)}
            className="p-1.5 min-h-11 min-w-11 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
            title={t('dashboard.statFactory.deleteStatBlock')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
