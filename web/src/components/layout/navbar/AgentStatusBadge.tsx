import { Loader2 } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '../../../lib/cn'

export interface AgentStatusPillStyle {
  bg: string
  dot: string
  label: string
  title: string
  Icon: ComponentType<{ className?: string }>
}

interface AgentStatusBadgeProps {
  isLoading: boolean
  connectingLabel: string
  pillStyle: AgentStatusPillStyle
  showLabel: boolean
  onClick: () => void
}

export function AgentStatusBadge({
  isLoading,
  connectingLabel,
  pillStyle,
  showLabel,
  onClick,
}: AgentStatusBadgeProps) {
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg whitespace-nowrap',
          'bg-yellow-500/10 text-yellow-400',
        )}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm font-medium hidden sm:inline whitespace-nowrap">
          {connectingLabel}
        </span>
      </div>
    )
  }

  return (
    <button
      data-testid="navbar-agent-status-btn"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 px-3 py-1.5 h-9 rounded-lg whitespace-nowrap',
        pillStyle.bg,
      )}
      title={pillStyle.title}
    >
      <pillStyle.Icon className="w-4 h-4" />
      <span className={cn('text-sm font-medium whitespace-nowrap', showLabel ? 'inline' : 'hidden sm:inline')}>
        {pillStyle.label}
      </span>
      <span className={cn('w-2 h-2 rounded-full shrink-0', pillStyle.dot)} />
    </button>
  )
}
