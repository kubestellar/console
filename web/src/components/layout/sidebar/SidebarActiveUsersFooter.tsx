import { useTranslation } from 'react-i18next'
import { User, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/cn'

declare const __COMMIT_HASH__: string

interface SidebarActiveUsersFooterProps {
  viewerCount: number
  viewersError: boolean
  viewersLoading: boolean
  showVersionCheck: boolean
  channel: string
  hasUpdate: boolean
  isUpgrading: boolean
  latestMainSHA?: string | null
}

export function SidebarActiveUsersFooter({
  viewerCount,
  viewersError,
  viewersLoading,
  showVersionCheck,
  channel,
  hasUpdate,
  isUpgrading,
  latestMainSHA,
}: SidebarActiveUsersFooterProps) {
  const { t } = useTranslation()

  return (
    <div className="mt-auto pt-4 border-t border-border/30 flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-2">
        <div className="flex items-center gap-1 px-2 text-muted-foreground/60">
          <span className="sr-only">{t('sidebar.activeViewers', { count: viewerCount })}</span>
          <User className={cn('w-3 h-3', viewersError && 'text-red-400')} aria-hidden="true" />
          <span className="text-2xs tabular-nums" aria-hidden="true">
            {viewersError ? '!' : viewersLoading ? '…' : viewerCount}
          </span>
        </div>
        <span className="text-2xs text-muted-foreground/40 font-mono" title={`Commit: ${__COMMIT_HASH__}`}>
          <span className="sr-only">{`Commit: ${__COMMIT_HASH__}`}</span>
          <span aria-hidden="true">#{__COMMIT_HASH__.substring(0, 7)}</span>
        </span>
      </div>
      {showVersionCheck && channel === 'developer' && hasUpdate && (
        <div
          className={cn(
            'flex items-center gap-1 text-2xs',
            isUpgrading ? 'text-cyan-400/80' : 'text-yellow-400/80',
          )}
          title={isUpgrading
            ? t('update.upgrading', 'Upgrading...')
            : `Behind main — latest: ${latestMainSHA?.substring(0, 7) ?? 'unknown'}`}
        >
          {isUpgrading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )}
          <span>
            {isUpgrading
              ? t('update.upgrading', 'Upgrading...')
              : t('sidebar.behindMain', 'Behind main')}
          </span>
        </div>
      )}
    </div>
  )
}
