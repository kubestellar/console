import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Key } from 'lucide-react'
import { APIKeySettings } from '../../agent/APIKeySettings'

export function APIKeysSection() {
  const { t } = useTranslation()
  const [showAPIKeySettings, setShowAPIKeySettings] = useState(false)

  return (
    <>
      <div id="api-keys-settings" className="glass rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary">
              <Key className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">{t('settings.apiKeys.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('settings.apiKeys.subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-secondary/30 mb-4">
          <p className="text-sm text-muted-foreground">
            {t('settings.apiKeys.securityNote')}
          </p>
        </div>

        <button
          onClick={() => setShowAPIKeySettings(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
        >
          <Key className="w-4 h-4" />
          {t('settings.apiKeys.manageKeys')}
        </button>
      </div>

      <APIKeySettings isOpen={showAPIKeySettings} onClose={() => setShowAPIKeySettings(false)} />
    </>
  )
}
