/**
 * DashboardTabBar - tab strip for tab-mode UnifiedDashboard layouts.
 *
 * Extracted verbatim from UnifiedDashboard.tsx (#22979).
 */

import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { AgentIcon } from '../../../../components/agent/AgentIcon'
import type { DashboardTab } from '../../types'

export interface DashboardTabBarProps {
  tabs: DashboardTab[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}

export function DashboardTabBar({ tabs, activeTabId, onSelectTab, onKeyDown }: DashboardTabBarProps) {
  const { t } = useTranslation()

  return (
    // overflow-x-auto + shrink-0 tabs + scroll-enhanced keep this bar usable
    // on mobile widths instead of squeezing/wrapping tabs or overflowing the
    // viewport horizontally (#23821).
    <div
      role="tablist"
      className="flex items-center gap-1 mb-6 border-b border-border overflow-x-auto scroll-enhanced"
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab: DashboardTab) => (
        <button
          key={tab.id}
          role="tab"
          data-tab-id={tab.id}
          aria-selected={activeTabId === tab.id}
          aria-label={tab.label}
          tabIndex={activeTabId === tab.id ? 0 : -1}
          onClick={() => !tab.disabled && onSelectTab(tab.id)}
          disabled={tab.disabled}
          className={`flex items-center gap-2 shrink-0 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
            activeTabId === tab.id
              ? 'border-primary text-foreground'
              : tab.disabled
                ? 'border-transparent text-muted-foreground/40 cursor-not-allowed'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          {tab.icon && <AgentIcon provider={tab.icon} className="w-4 h-4" />}
          {tab.label}
          {tab.disabled && tab.installUrl && (
            <a
              href={tab.installUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground/60 hover:text-muted-foreground ml-1"
            >
              {t('common.install')} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </button>
      ))}
    </div>
  )
}
