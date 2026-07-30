import { AlertTriangle, CheckCircle, Info, XCircle, type LucideIcon } from 'lucide-react'

export interface CardEmptyStateProps {
  /** Icon to display */
  icon?: LucideIcon
  /** Main title */
  title: string
  /** Secondary message */
  message?: string
  /** Variant determines color scheme */
  variant?: 'success' | 'info' | 'warning' | 'error' | 'neutral'
  /** Optional action button */
  action?: {
    label: string
    onClick: () => void
  }
}

export const emptyStateVariants = {
  success: {
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
    icon: CheckCircle },
  info: {
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    icon: Info },
  warning: {
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-400',
    icon: AlertTriangle },
  error: {
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-400',
    icon: XCircle },
  neutral: {
    iconBg: 'bg-secondary',
    iconColor: 'text-muted-foreground',
    icon: Info } }

export function CardEmptyState({
  icon,
  title,
  message,
  variant = 'neutral',
  action }: CardEmptyStateProps) {
  const variantConfig = emptyStateVariants[variant]
  const Icon = icon || variantConfig.icon

  return (
    <div className="h-full flex flex-col content-loaded">
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
        <div
          className={`w-12 h-12 rounded-full ${variantConfig.iconBg} flex items-center justify-center mb-3`}
          title={title}
        >
          <Icon className={`w-6 h-6 ${variantConfig.iconColor}`} />
        </div>
        <p className="text-foreground font-medium">{title}</p>
        {message && (
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="mt-3 px-3 py-1.5 text-sm rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// CardErrorState - Error state with retry option
// ============================================================================

export interface CardErrorStateProps {
  /** Error message */
  error: string
  /** Retry callback */
  onRetry?: () => void
  /** Whether retry is in progress */
  isRetrying?: boolean
}

export function CardErrorState({ error, onRetry, isRetrying }: CardErrorStateProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-4">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
        <AlertTriangle className="w-6 h-6 text-red-400" />
      </div>
      <p className="text-foreground font-medium">Error loading data</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-3 px-3 py-1.5 text-sm rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {isRetrying ? 'Retrying...' : 'Try again'}
        </button>
      )}
    </div>
  )
}
