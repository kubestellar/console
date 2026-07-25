import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ResourceKind } from '../NamespaceResources'
import { cn } from '../../../lib/cn'

interface ResourceTypeAccordionProps {
  kind: ResourceKind
  count: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
  icon?: React.ReactNode
}

export function ResourceTypeAccordion({
  kind,
  count,
  expanded,
  onToggle,
  children,
  icon,
}: ResourceTypeAccordionProps) {
  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 font-medium text-foreground hover:bg-card/70 transition-colors',
          expanded ? 'bg-card/70' : ''
        )}
      >
        <ChevronDown className={cn('w-4 h-4 transition-transform', expanded ? 'rotate-180' : '')} />
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <span className="flex-1 text-left">{kind}</span>
        <span className="text-xs font-mono bg-secondary px-2 py-1 rounded text-muted-foreground">
          {count}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2 bg-secondary/20">
          {children}
        </div>
      )}
    </div>
  )
}
