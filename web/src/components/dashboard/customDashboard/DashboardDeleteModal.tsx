import { AlertTriangle, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../lib/modals'

interface DashboardDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  dashboardName: string
}

export function DashboardDeleteModal({ isOpen, onClose, onConfirm, dashboardName }: DashboardDeleteModalProps) {
  const { t } = useTranslation()

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title={t('dashboard.delete.title')}
        description={t('dashboard.delete.confirm', { name: dashboardName })}
        icon={Trash2}
        onClose={onClose}
        showBack={false}
      />
      <BaseModal.Content>
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium">{t('dashboard.delete.warning')}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t('dashboard.delete.details')}
            </p>
          </div>
        </div>
      </BaseModal.Content>
      <BaseModal.Footer>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('actions.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          {t('dashboard.delete.title')}
        </button>
      </BaseModal.Footer>
    </BaseModal>
  )
}
