import { useState } from 'react'
import { AlertCircle, AlertTriangle, Shield, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useMissions } from '../../../hooks/useMissions'
import { useCardLoadingState } from '../CardDataContext'
import { loadMissionPrompt } from '../multi-tenancy/missionLoader'
import { useApiKeyCheck, ApiKeyPromptModal } from '../console-missions/shared'
import { ConfirmMissionPromptDialog } from '../../missions/ConfirmMissionPromptDialog'
import { CARD_INSTALL_MAP } from '../../../lib/cards/cardInstallMap'
import type { CardConfig } from './cardTypes'
import { FALCO_INSTALL_PROMPT } from './complianceConstants'

export function FalcoAlertsCard({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { isDemoMode } = useDemoMode()
  const { startMission } = useMissions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)

  const showDemo = isDemoMode
  useCardLoadingState({ isLoading: false, hasAnyData: showDemo, isDemoData: showDemo })

  const demoAlerts = [
    { severity: 'critical', message: 'Container escape attempt detected', time: '2m ago' },
    { severity: 'warning', message: 'Privileged pod spawned', time: '15m ago' },
    { severity: 'info', message: 'Shell spawned in container', time: '1h ago' },
  ]

  const handleInstallFalco = () => {
    checkKeyAndRun(async () => {
      const installInfo = CARD_INSTALL_MAP.falco_alerts
      const prompt = await loadMissionPrompt(
        installInfo?.missionKey ?? 'install-falco',
        FALCO_INSTALL_PROMPT,
        installInfo?.kbPaths,
      )
      setPendingPrompt(prompt)
    })
  }

  if (!showDemo) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-purple-400 font-medium">{t('cards:falcoAlerts.integration')}</p>
            <p className="text-muted-foreground">
              {t('cards:falcoAlerts.installDescription')}{' '}
              <a
                href="https://falco.org/docs/install-operate/installation/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                {t('cards:falcoAlerts.installGuide')} &rarr;
              </a>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground text-sm">
          <Shield className="w-6 h-6 mb-2 text-purple-400" />
          <p>{t('cards:falcoAlerts.noAlertsAvailable')}</p>
          <p className="text-xs mt-1">{t('cards:falcoAlerts.installToSee')}</p>
          <button
            onClick={handleInstallFalco}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 text-xs font-medium hover:bg-purple-500/30 transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            {t('cards:falcoAlerts.installWithMission')}
          </button>
        </div>
        <ApiKeyPromptModal isOpen={showKeyPrompt} onDismiss={dismissPrompt} onGoToSettings={goToSettings} />
        {pendingPrompt !== null && (
          <ConfirmMissionPromptDialog
            open={pendingPrompt !== null}
            missionTitle={t('cards:falcoAlerts.missionTitle')}
            missionDescription={t('cards:falcoAlerts.missionDescription')}
            initialPrompt={pendingPrompt}
            onCancel={() => setPendingPrompt(null)}
            onConfirm={(editedPrompt) => {
              setPendingPrompt(null)
              startMission({
                title: t('cards:falcoAlerts.missionTitle'),
                description: t('cards:falcoAlerts.missionDescription'),
                type: 'deploy',
                initialPrompt: editedPrompt,
              })
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {demoAlerts.map((alert, index) => (
          <div
            key={index}
            data-severity={alert.severity}
            aria-label={`${alert.severity} Falco alert`}
            className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
              alert.severity === 'critical' ? 'bg-red-500/10 text-red-400' :
                alert.severity === 'warning' ? 'bg-yellow-500/10 text-yellow-400' :
                  'bg-blue-500/10 text-blue-400'
            }`}
          >
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{alert.message}</p>
              <p className="text-muted-foreground">{alert.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
