/**
 * Utility Sections - Various reusable section components (Alert, Empty, Loading, Badges, QuickActions)
 */

import { ReactNode, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '../../components/ui/Button'

// ============================================================================
// Collapsible Section
// ============================================================================

export interface CollapsibleSectionProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  badge?: string | number
  className?: string
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  badge,
  className = '',
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={className}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 text-sm font-medium text-foreground hover:text-purple-400 transition-colors"
      >
        <span className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          {title}
        </span>
        {badge !== undefined && (
          <span className="px-2 py-0.5 rounded bg-secondary text-xs text-muted-foreground">
            {badge}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="pl-6 pb-2">
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Alert Section
// ============================================================================

export interface AlertSectionProps {
  type: 'info' | 'warning' | 'error' | 'success'
  title?: string
  message: string
  className?: string
}

export function AlertSection({
  type,
  title,
  message,
  className = '',
}: AlertSectionProps) {
  const styles = {
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
    error: 'bg-red-500/10 border-red-500/20 text-red-400',
    success: 'bg-green-500/10 border-green-500/20 text-green-400',
  }

  return (
    <div className={`p-3 rounded-lg border ${styles[type]} ${className}`}>
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          {title && (
            <p className="font-medium text-sm">{title}</p>
          )}
          <p className="text-sm opacity-90">{message}</p>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Empty State Section
// ============================================================================

export interface EmptySectionProps {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  message?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptySection({
  icon: Icon,
  title,
  message,
  action,
  className = '',
}: EmptySectionProps) {
  return (
    <div className={`text-center py-8 ${className}`}>
      {Icon && (
        <Icon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      )}
      <h3 className="text-foreground font-medium mb-1">{title}</h3>
      {message && (
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
      )}
      {action && (
        <Button
          variant="accent"
          size="lg"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}

// ============================================================================
// Loading Section
// ============================================================================

export interface LoadingSectionProps {
  message?: string
  className?: string
}

export function LoadingSection({
  message = 'Loading...',
  className = '',
}: LoadingSectionProps) {
  return (
    <div className={`flex items-center justify-center py-8 ${className}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  )
}

// ============================================================================
// Badges Section
// ============================================================================

export interface Badge {
  label: string
  value: string
  color?: string
  onClick?: () => void
}

export interface BadgesSectionProps {
  badges: Badge[]
  className?: string
}

export function BadgesSection({ badges, className = '' }: BadgesSectionProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {badges.map((badge, index) => (
        <span
          key={index}
          onClick={badge.onClick}
          {...(badge.onClick ? {
            role: 'button' as const,
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); badge.onClick!() } },
          } : {})}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
            badge.color || 'bg-secondary text-muted-foreground'
          } ${badge.onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
        >
          <span className="text-muted-foreground">{badge.label}:</span>
          <span>{badge.value}</span>
        </span>
      ))}
    </div>
  )
}

// ============================================================================
// Quick Actions Section
// ============================================================================

export interface QuickAction {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  variant?: 'default' | 'primary' | 'danger'
  disabled?: boolean
}

export interface QuickActionsSectionProps {
  actions: QuickAction[]
  className?: string
}

export function QuickActionsSection({
  actions,
  className = '',
}: QuickActionsSectionProps) {
  const variantStyles = {
    default: 'bg-secondary hover:bg-secondary/80 text-foreground',
    primary: 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400',
    danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.id}
            onClick={action.onClick}
            disabled={action.disabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              variantStyles[action.variant || 'default']
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Icon className="w-4 h-4" />
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
