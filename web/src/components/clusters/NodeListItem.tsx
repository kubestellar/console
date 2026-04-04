import { Server, ChevronRight } from 'lucide-react'
import { NodeInfo } from '../../hooks/useMCP'
import { hasConditionIssues } from '../shared/ConditionBadges'
import { cn } from '../../lib/cn'
import { formatK8sMemory } from '../../lib/formatters'

interface NodeListItemProps {
  node: NodeInfo
  isSelected?: boolean
  onClick?: () => void
}

/**
 * A clickable row displaying a node with its status, resources, and IP.
 * Used in cluster detail views and node list cards.
 */
export function NodeListItem({ node, isSelected, onClick }: NodeListItemProps) {
  const hasIssues = hasConditionIssues(node.conditions)
  const isReady = node.status === 'Ready'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-3 py-2 flex items-center justify-between transition-colors text-left',
        hasIssues ? 'bg-orange-500/5' : 'hover:bg-card/30',
        isSelected && 'bg-primary/10'
      )}
    >
      <div className="flex items-center gap-2">
        <Server className={cn(
          'w-4 h-4',
          !isReady ? 'text-red-400' : hasIssues ? 'text-orange-400' : 'text-green-400'
        )} />
        <span className="font-mono text-sm text-foreground">{node.name}</span>
        {node.roles.map(role => (
          <span key={role} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {role}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{node.cpuCapacity} CPU</span>
        <span>{formatK8sMemory(node.memoryCapacity)}</span>
        <span className="font-mono text-xs">{node.internalIP || '-'}</span>
        <ChevronRight className="w-4 h-4" />
      </div>
    </button>
  )
}
