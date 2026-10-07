// Components / Issues tab bar for the llm-d stack monitor card.
// Extracted from LLMdStackMonitor.tsx (issue #24058) — markup unchanged.
import { Layers, AlertTriangle } from 'lucide-react'
import { cn } from '../../../lib/cn'

export type LLMdStackMonitorTab = 'components' | 'issues'

interface LLMdStackMonitorTabsProps {
  activeTab: LLMdStackMonitorTab
  onTabChange: (tab: LLMdStackMonitorTab) => void
  totalComponents: number
  issueCount: number
}

export function LLMdStackMonitorTabs({ activeTab, onTabChange, totalComponents, issueCount }: LLMdStackMonitorTabsProps) {
  return (
    <div className="flex items-center gap-1 mb-3 border-b border-border">
      <button
        onClick={() => onTabChange('components')}
        className={cn(
          'px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors flex items-center gap-1.5',
          activeTab === 'components'
            ? 'bg-card border border-b-0 border-border text-foreground -mb-px'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Layers className="w-3 h-3" />
        Components
        <span className={cn(
          'px-1.5 py-0.5 rounded text-2xs',
          activeTab === 'components' ? 'bg-purple-500/20 text-purple-400' : 'bg-secondary'
        )}>
          {totalComponents}
        </span>
      </button>
      <button
        onClick={() => onTabChange('issues')}
        className={cn(
          'px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors flex items-center gap-1.5',
          activeTab === 'issues'
            ? 'bg-card border border-b-0 border-border text-foreground -mb-px'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <AlertTriangle className="w-3 h-3" />
        Issues
        {issueCount > 0 && (
          <span className={cn(
            'px-1.5 py-0.5 rounded text-2xs',
            activeTab === 'issues' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-500/20 text-yellow-400'
          )}>
            {issueCount}
          </span>
        )}
      </button>
    </div>
  )
}
