import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { HelmHistoryEntry } from '../../hooks/useMCP'
import { StatusBadge } from '../ui/StatusBadge'
import { getStatusIcon, getStatusColor, formatDate } from './HelmHistory.utils'

interface HelmHistoryEntryRowProps {
  entry: HelmHistoryEntry
  onSelect: (entry: HelmHistoryEntry) => void
}

/** Single revision row in the Helm history timeline. */
export function HelmHistoryEntryRow({ entry, onSelect }: HelmHistoryEntryRowProps) {
  const { t } = useTranslation(['cards', 'common'])
  const StatusIcon = getStatusIcon(entry.status)
  const color = getStatusColor(entry.status)
  const isCurrent = entry.status === 'deployed'

  return (
    <div
      className="relative pl-6 group cursor-pointer"
      onClick={() => onSelect(entry)}
      title={`Click to view details for revision ${entry.revision}`}
    >
      {/* Timeline dot */}
      <div className={`absolute left-0 top-2 w-4 h-4 rounded-full flex items-center justify-center ${
        isCurrent ? 'bg-green-500' : 'bg-secondary border border-border'
      }`}>
        <StatusIcon className={`w-2.5 h-2.5 ${isCurrent ? 'text-foreground' : `text-${color}-400`}`} />
      </div>

      <div className={`p-2 rounded-lg transition-colors ${isCurrent ? 'bg-green-500/10 border border-green-500/20 group-hover:bg-green-500/20' : 'bg-secondary/30 group-hover:bg-secondary/50'}`}>
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{t('helmHistory.rev', { revision: entry.revision })}</span>
            {isCurrent && (
              <StatusBadge color="green">
                {t('helmHistory.current')}
              </StatusBadge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{formatDate(entry.updated)}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          <span>{entry.chart}</span>
          {entry.description && (
            <>
              <span className="mx-2">•</span>
              <span className="truncate">{entry.description}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
