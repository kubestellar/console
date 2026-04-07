/**
 * ConfirmDialog - Styled confirmation dialog built on BaseModal
 *
 * Use this instead of window.confirm() for all destructive or important actions.
 * See component-criteria.md for usage guidelines.
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   isOpen={showDelete}
 *   onClose={() => setShowDelete(false)}
 *   onConfirm={handleDelete}
 *   title="Delete Resource"
 *   message="This will permanently delete the resource. This action cannot be undone."
 *   confirmLabel="Delete"
 *   variant="danger"
 * />
 * ```
 */

import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '../../components/ui/Button'

export interface ConfirmDialogProps {
  /** Whether dialog is open */
  isOpen: boolean
  /** Close handler */
  onClose: () => void
  /** Confirm handler */
  onConfirm: () => void
  /** Dialog title */
  title: string
  /** Description/message body */
  message: string
  /** Confirm button label (default: 'Confirm') */
  confirmLabel?: string
  /** Cancel button label (default: 'Cancel') */
  cancelLabel?: string
  /** Visual variant — colors the confirm button and icon */
  variant?: 'danger' | 'warning' | 'info'
  /** Show loading spinner on confirm button */
  isLoading?: boolean
}

const variantConfig = {
  danger: {
    icon: AlertCircle,
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-400',
    confirmBg: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-400',
    confirmBg: 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400',
  },
  info: {
    icon: Info,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    confirmBg: 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400',
  },
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="p-6">
        {/* Icon */}
        <div className={`w-12 h-12 rounded-full ${config.iconBg} flex items-center justify-center mb-4 mx-auto`}>
          <Icon className={`w-6 h-6 ${config.iconColor}`} />
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-foreground text-center mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground text-center mb-6">{message}</p>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1"
          >
            {cancelLabel}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={onConfirm}
            disabled={isLoading}
            loading={isLoading}
            className={`flex-1 ${config.confirmBg}`}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </BaseModal>
  )
}
