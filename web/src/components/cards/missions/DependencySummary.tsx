import { useState } from 'react'
import { ChevronDown, ChevronRight, Package } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { DeployedDep } from '../../../lib/cardEvents'

interface DependencySummaryProps {
  dependencies: DeployedDep[]
  depActionStyles: Record<string, { color: string; label: string }>
}

export function DependencySummary({ dependencies, depActionStyles }: DependencySummaryProps) {
  // Group by kind for summary line
  const kindCounts: Record<string, number> = {}
  for (const dep of dependencies) {
    kindCounts[dep.kind] = (kindCounts[dep.kind] || 0) + 1
  }
  const summary = Object.entries(kindCounts)
    .map(([kind, count]) => `${count} ${kind}${count !== 1 ? 's' : ''}`)
    .join(', ')

  const [showAll, setShowAll] = useState(false)

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setShowAll(!showAll)}
        className="flex items-center gap-1.5 text-2xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Package className="w-2.5 h-2.5" />
        <span>Deployed {summary}</span>
        {showAll
          ? <ChevronDown className="w-2.5 h-2.5" />
          : <ChevronRight className="w-2.5 h-2.5" />}
      </button>
      {showAll && (
        <div className="mt-1 ml-4 space-y-0.5">
          {dependencies.map((dep, i) => {
            const style = depActionStyles[dep.action] ?? depActionStyles.created
            return (
              <div key={i} className="flex items-center gap-2 text-2xs">
                <span className="text-muted-foreground/70 w-28 truncate">{dep.kind}</span>
                <span className="text-muted-foreground flex-1 truncate">{dep.name}</span>
                <span className={cn('shrink-0', style.color)}>{style.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
