import { PanelRightOpen, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LogoWithStar } from '../../ui/LogoWithStar'
import { cn } from '../../../lib/cn'

interface MissionSidebarMinimizedProps {
  onExpand: () => void
  activeMissionsCount: number
  runningCount: number
  needsAttention: number
}

export function MissionSidebarMinimized({
  onExpand,
  activeMissionsCount,
  runningCount,
  needsAttention,
}: MissionSidebarMinimizedProps) {
  const { t } = useTranslation(['common'])

  return (
    <div
      className={cn(
      "fixed top-16 right-0 bottom-0 w-12 bg-card/95 backdrop-blur-xs border-l border-border shadow-xl z-sidebar flex flex-col items-center py-4",
      "transition-transform duration-300 ease-in-out"
    )}>
      <button
        onClick={onExpand}
        className="p-2 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10 mb-4"
        title={t('missionSidebar.expandSidebar')}
      >
        <PanelRightOpen className="w-5 h-5 text-muted-foreground" />
      </button>

      <div className="flex flex-col items-center gap-2">
        <LogoWithStar className="w-5 h-5" />
        {activeMissionsCount > 0 && (
          <span className="text-xs font-medium text-foreground">{activeMissionsCount}</span>
        )}
        {runningCount > 0 && (
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
        )}
        {needsAttention > 0 && (
          <span className="w-5 h-5 flex items-center justify-center text-xs bg-purple-500/20 text-purple-400 rounded-full">
            {needsAttention}
          </span>
        )}
      </div>
    </div>
  )
}
