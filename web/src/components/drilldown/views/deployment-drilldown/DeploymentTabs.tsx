import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button } from '../../../ui/Button'
import { cn } from '../../../../lib/cn'
import type { TabType } from './types'

export interface DeploymentTabItem {
  id: TabType
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export interface DeploymentTabsProps {
  tabs: DeploymentTabItem[]
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  onTabKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  ariaLabel: string
}

export function DeploymentTabs({ tabs, activeTab, onTabChange, onTabKeyDown, ariaLabel }: DeploymentTabsProps) {
  return (
    <div className="border-b border-border px-6">
      <div className="flex gap-1" role="tablist" aria-label={ariaLabel} onKeyDown={onTabKeyDown}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <Button
              key={tab.id}
              variant="ghost"
              id={`deployment-tab-${tab.id}`}
              data-tab-id={tab.id}
              role="tab"
              tabIndex={activeTab === tab.id ? 0 : -1}
              aria-selected={activeTab === tab.id}
              aria-controls={`deployment-panel-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'rounded-none border-b-2 px-4 py-2 text-sm',
                activeTab === tab.id
                  ? 'text-primary border-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
