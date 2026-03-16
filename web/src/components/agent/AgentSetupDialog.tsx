'use client'

import { useState, useEffect, useRef } from 'react'
import { Download, ChevronDown, ChevronRight } from 'lucide-react'
import { useLocalAgent } from '@/hooks/useLocalAgent'
import { BaseModal } from '../../lib/modals'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import { useTranslation } from 'react-i18next'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'

const DISMISSED_KEY = 'kc-agent-setup-dismissed'
const SNOOZED_KEY = 'kc-agent-setup-snoozed'
const SNOOZE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export function AgentSetupDialog() {
  const { t } = useTranslation('common')
  const { status, isConnected } = useLocalAgent()
  const [show, setShow] = useState(false)
  const [copiedMacOS, setCopiedMacOS] = useState(false)
  const [copiedLinux, setCopiedLinux] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const copiedLinuxTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const macOSInstallCommand = 'brew tap kubestellar/tap && brew install --head kc-agent && kc-agent'
  const linuxBuildCommand = 'git clone https://github.com/kubestellar/console.git && cd console && go build -o bin/kc-agent ./cmd/kc-agent && ./bin/kc-agent'

  useEffect(() => {
    return () => {
      clearTimeout(copiedTimerRef.current)
      clearTimeout(copiedLinuxTimerRef.current)
    }
  }, [])

  useEffect(() => {
    // Only show after initial connection check completes
    if (status === 'connecting') return

    // Don't show if already connected
    if (isConnected) return

    // Check if user previously dismissed permanently
    const dismissed = safeGetItem(DISMISSED_KEY)
    if (dismissed) return

    // Check if snoozed and still within snooze period
    const snoozedUntil = safeGetItem(SNOOZED_KEY)
    if (snoozedUntil && Date.now() < parseInt(snoozedUntil)) return

    // Show the dialog
    setShow(true)
  }, [status, isConnected])

  const [showLinux, setShowLinux] = useState(false)

  const copyMacOS = async () => {
    await copyToClipboard(macOSInstallCommand)
    setCopiedMacOS(true)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedMacOS(false), UI_FEEDBACK_TIMEOUT_MS)
  }

  const copyLinux = async () => {
    await copyToClipboard(linuxBuildCommand)
    setCopiedLinux(true)
    clearTimeout(copiedLinuxTimerRef.current)
    copiedLinuxTimerRef.current = setTimeout(() => setCopiedLinux(false), UI_FEEDBACK_TIMEOUT_MS)
  }

  const handleSnooze = () => {
    safeSetItem(SNOOZED_KEY, String(Date.now() + SNOOZE_DURATION))
    setShow(false)
  }

  const handleDismiss = (rememberChoice: boolean) => {
    if (rememberChoice) {
      safeSetItem(DISMISSED_KEY, 'true')
    }
    setShow(false)
  }

  return (
    <BaseModal isOpen={show} onClose={() => handleDismiss(false)} size="md">
      <BaseModal.Header
        title={t('agentSetup.welcomeTitle')}
        description={t('agentSetup.welcomeDescription')}
        icon={Download}
        onClose={() => handleDismiss(false)}
        showBack={false}
      />

      <BaseModal.Content>
        {/* macOS Install Option */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="font-medium">{t('agentSetup.quickInstallMacOS')}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('agentSetup.copyAndRun')}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono select-all overflow-x-auto">
              {macOSInstallCommand}
            </code>
            <button
              onClick={copyMacOS}
              className="shrink-0 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {copiedMacOS ? t('agentSetup.copied') : t('agentSetup.copy')}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>✓ {t('agentSetup.kubeconfigClusters')}</span>
            <span>✓ {t('agentSetup.realtimeTokenUsage')}</span>
            <span>✓ {t('agentSetup.localAndSecure')}</span>
          </div>
        </div>

        {/* Linux Install Option (collapsible) */}
        <div className="mt-3">
          <button
            onClick={() => setShowLinux(!showLinux)}
            className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            {showLinux ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {t('agentSetup.linuxInstructions')}
          </button>
          {showLinux && (
            <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">{t('agentSetup.linuxBuildDesc')}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                  {linuxBuildCommand}
                </code>
                <button
                  onClick={copyLinux}
                  className="shrink-0 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {copiedLinux ? t('agentSetup.copied') : t('agentSetup.copy')}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{t('agentSetup.linuxBrewAlternative')}</p>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          {t('agentSetup.installFromSettings')}
        </p>
      </BaseModal.Content>

      <BaseModal.Footer>
        <button
          onClick={() => handleDismiss(true)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('agentSetup.dontShowAgain')}
        </button>
        <div className="flex-1" />
        <div className="flex gap-3">
          <button
            onClick={() => handleDismiss(false)}
            className="rounded border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {t('agentSetup.continueWithDemoData')}
          </button>
          <button
            onClick={handleSnooze}
            className="rounded border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {t('agentSetup.remindMeLater')}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
