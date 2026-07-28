import type { ComponentType } from 'react'
import { cn } from '../../../../lib/cn'
import type { TabType } from './types'

export interface HelmTabDefinition {
  id: TabType
  label: string
  icon: ComponentType<{ className?: string }>
}

export interface HelmTabsProps {
  activeTab: TabType
  tabs: HelmTabDefinition[]
  onSelectTab: (tab: TabType) => void
}

export function HelmTabs({ activeTab, tabs, onSelectTab }: HelmTabsProps) {
  return (
    <div className="border-b border-border px-6">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border',
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
