import { PlusCircle, RefreshCw, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="sm">
      <BaseModal.Header
        title={t('dashboard.reset.title')}
        description={t('dashboard.reset.description')}
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
                <div className="font-medium text-foreground mb-1">{t('dashboard.reset.addMissing')}</div>
                <p className="text-sm text-muted-foreground">
                  {t('dashboard.reset.addMissingDesc')}
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
                <div className="font-medium text-foreground mb-1">{t('dashboard.reset.replaceAll')}</div>
                <p className="text-sm text-muted-foreground">
                  {t('dashboard.reset.replaceAllDesc')}
                </p>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-orange-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{t('dashboard.resetWarning')}</span>
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
          {t('actions.cancel')}
        </button>
      </BaseModal.Footer>
    </BaseModal>
  )
}
