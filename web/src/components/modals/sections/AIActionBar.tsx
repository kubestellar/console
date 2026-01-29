import { Bot, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMissions } from '../../../hooks/useMissions'
import type { AIAction, ResourceContext } from '../types/modal.types'

interface AIActionBarProps {
  /** Resource being viewed */
  resource: ResourceContext
  /** AI actions to display */
  actions: AIAction[]
  /** Handler when an action is clicked */
  onAction: (action: AIAction) => void
  /** Whether the resource is unreachable (disables all actions) */
  isUnreachable?: boolean
  /** Additional issue count to show on repair button */
  issueCount?: number
  /** Whether to show a compact version */
  compact?: boolean
  /** Additional className */
  className?: string
}

const ACTION_STYLES = {
  diagnose: {
    base: 'bg-blue-500/20 text-blue-400',
    hover: 'hover:bg-blue-500/30',
    badge: 'bg-blue-500/30',
  },
  repair: {
    base: 'bg-orange-500/20 text-orange-400',
    hover: 'hover:bg-orange-500/30',
    badge: 'bg-orange-500/30',
  },
  ask: {
    base: 'bg-purple-500/20 text-purple-400',
    hover: 'hover:bg-purple-500/30',
    badge: 'bg-purple-500/30',
  },
  custom: {
    base: 'bg-gray-500/20 text-gray-400',
    hover: 'hover:bg-gray-500/30',
    badge: 'bg-gray-500/30',
  },
}

/**
 * AI Action Bar component for modals
 *
 * Displays Diagnose, Repair, and Ask buttons that integrate with AI.
 * Shows connection status and provides quick access to AI-powered diagnostics.
 *
 * @example
 * ```tsx
 * <AIActionBar
 *   resource={{ kind: 'Pod', name: 'my-pod', cluster: 'prod' }}
 *   actions={defaultAIActions}
 *   onAction={handleAIAction}
 *   issueCount={3}
 * />
 * ```
 */
export function AIActionBar({
  actions,
  onAction,
  isUnreachable = false,
  issueCount,
  compact = false,
  className = '',
}: AIActionBarProps) {
  const { agents } = useMissions()
  const isAgentConnected = agents.length > 0

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {actions.map((action) => {
          const styles = ACTION_STYLES[action.id] || ACTION_STYLES.custom
          const Icon = action.icon
          const isDisabled = action.disabled || isUnreachable || !isAgentConnected

          return (
            <button
              key={action.id}
              onClick={() => !isDisabled && onAction(action)}
              disabled={isDisabled}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${styles.base} ${!isDisabled ? styles.hover : ''} disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isDisabled ? (action.disabledReason || 'Unavailable') : action.description}
            >
              <Icon className="w-3 h-3" />
              {action.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className={`p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-purple-400" />
          <span className="text-sm font-medium text-foreground">AI Assistant</span>
        </div>

        {!isAgentConnected && (
          <Link
            to="/settings"
            className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
            title="Configure AI agent"
          >
            <Settings className="w-3 h-3" />
            Configure AI
          </Link>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const styles = ACTION_STYLES[action.id] || ACTION_STYLES.custom
          const Icon = action.icon
          const isDisabled = action.disabled || isUnreachable || !isAgentConnected
          const showBadge = action.id === 'repair' && issueCount && issueCount > 0

          return (
            <button
              key={action.id}
              onClick={() => !isDisabled && onAction(action)}
              disabled={isDisabled}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${styles.base} ${!isDisabled ? styles.hover : ''} disabled:opacity-50 disabled:cursor-not-allowed`}
              title={getTooltip(action, isAgentConnected, isUnreachable)}
            >
              <Icon className="w-3.5 h-3.5" />
              {action.label}
              {showBadge && (
                <span className={`px-1.5 py-0.5 rounded ${styles.badge} text-xs`}>
                  {issueCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Agent status message */}
      {!isAgentConnected && (
        <p className="mt-2 text-xs text-muted-foreground">
          Connect the local agent to enable AI features.{' '}
          <Link to="/settings" className="text-purple-400 hover:text-purple-300">
            Configure →
          </Link>
        </p>
      )}

      {isUnreachable && isAgentConnected && (
        <p className="mt-2 text-xs text-yellow-400">
          Resource is unreachable. AI actions are limited.
        </p>
      )}
    </div>
  )
}

function getTooltip(
  action: AIAction,
  isAgentConnected: boolean,
  isUnreachable: boolean
): string {
  if (!isAgentConnected) {
    return 'Connect AI agent in Settings to use this feature'
  }
  if (isUnreachable) {
    return 'Resource is unreachable'
  }
  if (action.disabledReason) {
    return action.disabledReason
  }
  return action.description
}

/**
 * Minimal AI action button for inline use
 */
interface AIActionButtonProps {
  action: AIAction
  onAction: () => void
  disabled?: boolean
  size?: 'sm' | 'md'
}

export function AIActionButton({
  action,
  onAction,
  disabled = false,
  size = 'md',
}: AIActionButtonProps) {
  const styles = ACTION_STYLES[action.id] || ACTION_STYLES.custom
  const Icon = action.icon
  const isDisabled = disabled || action.disabled

  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-1 text-[10px] gap-1'
    : 'px-2 py-1.5 text-xs gap-1.5'

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  return (
    <button
      onClick={() => !isDisabled && onAction()}
      disabled={isDisabled}
      className={`flex items-center rounded-lg font-medium transition-colors ${sizeClasses} ${styles.base} ${!isDisabled ? styles.hover : ''} disabled:opacity-50 disabled:cursor-not-allowed`}
      title={isDisabled ? (action.disabledReason || 'Unavailable') : action.description}
    >
      <Icon className={iconSize} />
      {action.label}
    </button>
  )
}
