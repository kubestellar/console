/**
 * MissionBrowserTabBar
 *
 * The horizontal tab navigation row (Recommended / Installers / Fixes / Browse)
 * plus the global refresh button at the right edge.
 *
 * Extracted from MissionBrowser.tsx (issue #8624).
 */

import { RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { BROWSER_TABS, missionCache, resetMissionCache } from './browser'
import type { BrowserTab } from './browser'

interface MissionBrowserTabBarProps {
  activeTab: BrowserTab
  onTabChange: (tab: BrowserTab) => void
  installerCount: number
  fixerCount: number
}

export function MissionBrowserTabBar({
  activeTab,
  onTabChange,
  installerCount,
  fixerCount,
}: MissionBrowserTabBarProps) {
  const isRefreshing =
    activeTab === 'installers'
      ? !missionCache.installersDone
      : activeTab === 'fixes'
        ? !missionCache.fixesDone
        : !missionCache.installersDone || !missionCache.fixesDone

  return (
    <div className="flex items-center gap-1 px-4 py-1.5 bg-card border-b border-border overflow-x-auto scrollbar-hide">
      {BROWSER_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
            activeTab === tab.id
              ? 'bg-purple-500/20 text-purple-400 font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
          )}
        >
          <span>{tab.icon}</span>
          {tab.label}
          {tab.id === 'installers' && (
            <span className="text-2xs bg-secondary px-1.5 py-0.5 rounded-full min-w-[28px] text-center tabular-nums">
              {installerCount || '–'}
            </span>
          )}
          {tab.id === 'fixes' && (
            <span className="text-2xs bg-secondary px-1.5 py-0.5 rounded-full min-w-[28px] text-center tabular-nums">
              {fixerCount || '–'}
            </span>
          )}
        </button>
      ))}

      {/* Refresh all mission data */}
      <button
        onClick={() => resetMissionCache()}
        className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
        title={
          activeTab === 'installers'
            ? 'Refresh installers'
            : activeTab === 'fixes'
              ? 'Refresh fixes'
              : 'Refresh all mission data'
        }
      >
        <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
      </button>
    </div>
  )
}
