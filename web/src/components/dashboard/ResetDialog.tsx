import { PlusCircle, RefreshCw, AlertTriangle } from 'lucide-react'
import { ResetMode } from '../../hooks/useDashboardReset'
import { BaseModal } from '../../lib/modals'

interface ResetDialogProps {
  isOpen: boolean
  onClose: () => void
  onReset: (mode: ResetMode) => void
}

/**
 * Dialog for resetting dashboard cards with two options:
 * - Add Missing: Keep current cards and add any missing defaults
 * - Replace All: Reset to only default cards (remove customizations)
 */
export function ResetDialog({ isOpen, onClose, onReset }: ResetDialogProps) {
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="sm">
      <BaseModal.Header
        title="Reset Dashboard"
        description="Choose how to reset your dashboard cards"
        icon={RefreshCw}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <div className="space-y-3">
          {/* Add Missing Option */}
          <button
            onClick={() => onReset('add_missing')}
            className="w-full p-4 rounded-lg border border-border/50 hover:border-green-500/50 hover:bg-green-500/5 text-left transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-green-500/10 text-green-400 group-hover:bg-green-500/20">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-foreground mb-1">Add Missing Cards</div>
                <p className="text-sm text-muted-foreground">
                  Keep your current cards and add any default cards that are missing.
                  Your customizations will be preserved.
                </p>
              </div>
            </div>
          </button>

          {/* Replace All Option */}
          <button
            onClick={() => onReset('replace')}
            className="w-full p-4 rounded-lg border border-border/50 hover:border-orange-500/50 hover:bg-orange-500/5 text-left transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 group-hover:bg-orange-500/20">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-foreground mb-1">Replace All Cards</div>
                <p className="text-sm text-muted-foreground">
                  Remove all current cards and replace them with the default set.
                  This will remove any customizations.
                </p>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-orange-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>This action cannot be undone</span>
                </div>
              </div>
            </div>
          </button>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        >
          Cancel
        </button>
      </BaseModal.Footer>
    </BaseModal>
  )
}
