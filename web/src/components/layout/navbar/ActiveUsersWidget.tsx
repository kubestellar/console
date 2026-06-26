import { Users } from 'lucide-react'
import { useActiveUsers } from '../../../hooks/useActiveUsers'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'

export function ActiveUsersWidget() {
  const { t } = useTranslation()
  const { viewerCount, isLoading, hasError } = useActiveUsers()

  // Don't render during initial load to avoid flash
  if (isLoading) return null

  const activeViewersLabel = hasError
    ? t('sidebar.activeViewersError', 'Unable to load viewer count')
    : t('sidebar.activeViewers', { count: viewerCount })

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
        hasError
          ? 'bg-red-500/10 text-red-400'
          : 'bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors'
      )}
      title={activeViewersLabel}
    >
      <span className="sr-only">{activeViewersLabel}</span>
      <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className="text-xs font-medium tabular-nums" aria-hidden="true">
        {hasError ? '—' : viewerCount}
      </span>
    </div>
  )
}
