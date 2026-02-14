import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { CanIChecker } from '../../rbac/CanIChecker'

export function PermissionsSection() {
  const { t } = useTranslation()
  return (
    <div id="permissions-settings" className="glass rounded-xl p-6 relative z-0">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-secondary">
          <ShieldCheck className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">{t('settings.permissions.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.permissions.subtitle')}</p>
        </div>
      </div>
      <CanIChecker />
    </div>
  )
}
