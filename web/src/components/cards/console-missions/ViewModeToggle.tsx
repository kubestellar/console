/**
 * List/grouped view toggle buttons shown next to the search box on
 * ConsoleOfflineDetectionCard, when root-cause groups have more than one
 * item worth grouping. Extracted from the main component's render body.
 */
import { Layers, List } from 'lucide-react'
import { cn } from '../../../lib/cn'

interface ViewModeToggleProps {
  viewMode: 'list' | 'grouped'
  onViewModeChange: (mode: 'list' | 'grouped') => void
}

export function ViewModeToggle({ viewMode, onViewModeChange }: ViewModeToggleProps) {
  return (
    <div className="flex bg-secondary/50 rounded-lg p-0.5">
      <button
        onClick={() => onViewModeChange('list')}
        className={cn(
          'p-1.5 rounded transition-colors',
          viewMode === 'list' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        title="List view"
      >
        <List className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onViewModeChange('grouped')}
        className={cn(
          'p-1.5 rounded transition-colors',
          viewMode === 'grouped' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        title="Group by root cause - see which fixes solve multiple issues"
      >
        <Layers className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
