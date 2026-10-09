import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown, Code2, Rocket, KeyRound, ExternalLink, CheckCircle2, XCircle, GitBranch,
} from 'lucide-react'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import type { OAuthStatus } from './ProfileCard.parts'

// ─── ProfileDevPanel ──────────────────────────────────────────────────────────

interface ProfileDevPanelProps {
  oauthStatus: OAuthStatus
  closeDropdown: () => void
  onShowSetupDialog: () => void
  onShowDevSetupDialog: () => void
}

export function ProfileDevPanel({
  oauthStatus,
  closeDropdown,
  onShowSetupDialog,
  onShowDevSetupDialog,
}: ProfileDevPanelProps) {
  const { t } = useTranslation()
  const [showDevPanel, setShowDevPanel] = useState(false)
  const { channel, installMethod } = useVersionCheck()

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setShowDevPanel(!showDevPanel)}
        className="w-full flex items-center gap-3 px-5 py-2 text-sm hover:bg-secondary transition-colors"
      >
        <Code2 className="w-4 h-4 text-blue-400" />
        <span className="text-foreground">{t('developer.title')}</span>
        <ChevronDown className={`w-3 h-3 ml-auto text-muted-foreground transition-transform ${showDevPanel ? 'rotate-180' : ''}`} />
      </button>
      {showDevPanel && (
        <div className="px-5 pb-3 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-1.5 py-0.5 rounded text-2xs uppercase font-bold ${__DEV_MODE__ ? 'bg-yellow-900 text-yellow-400' : 'bg-green-900 text-green-400'}`}>
              {__DEV_MODE__ ? 'dev' : 'prod'}
            </span>
            <span className="text-muted-foreground font-mono">
              {__APP_VERSION__.startsWith('v') ? __APP_VERSION__ : `v${__APP_VERSION__}`} · {__COMMIT_HASH__.substring(0, 7)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {oauthStatus.checked ? (
              oauthStatus.configured ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-green-400">{t('developer.oauthConfigured')}</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-yellow-400">{t('developer.oauthNotConfigured')}</span>
                </>
              )
            ) : (
              <span className="text-muted-foreground">{t('developer.checkingOauth')}</span>
            )}
          </div>

          {installMethod === 'dev' && channel === 'developer' && (
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-orange-400">
                {t('settings.updates.developer')}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeDropdown()
                if (installMethod === 'dev') {
                  onShowDevSetupDialog()
                } else {
                  onShowSetupDialog()
                }
              }}
              className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              <Rocket className="w-3.5 h-3.5" />
              {installMethod === 'dev' ? t('developer.devModeSetup') : t('developer.setupInstructions')}
            </button>
            {!oauthStatus.configured && oauthStatus.checked && (
              <a
                href="https://github.com/settings/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {t('developer.configureOauth')}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('developer.githubRepo')}
            </a>
            <a
              href="https://console-docs.kubestellar.io"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('developer.docs')}
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
