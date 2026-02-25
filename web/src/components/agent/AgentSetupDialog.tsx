'use client'

import { useState, useEffect, useRef } from 'react'
import { Download } from 'lucide-react'
import { useLocalAgent } from '@/hooks/useLocalAgent'
import { BaseModal } from '../../lib/modals'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import { useTranslation } from 'react-i18next'

const DISMISSED_KEY = 'kc-agent-setup-dismissed'
const SNOOZED_KEY = 'kc-agent-setup-snoozed'
const SNOOZE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export function AgentSetupDialog() {
  const { t } = useTranslation('common')
  const { status, isConnected } = useLocalAgent()
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const installCommand = 'brew install kubestellar/tap/kc-agent && kc-agent'

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
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

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(installCommand)
    setCopied(true)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
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
        {/* Install Option */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="font-medium">{t('agentSetup.quickInstall')}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('agentSetup.copyAndRun')}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono select-all overflow-x-auto">
              {installCommand}
            </code>
            <button
              onClick={copyToClipboard}
              className="shrink-0 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {copied ? t('agentSetup.copied') : t('agentSetup.copy')}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>✓ {t('agentSetup.kubeconfigClusters')}</span>
            <span>✓ {t('agentSetup.realtimeTokenUsage')}</span>
            <span>✓ {t('agentSetup.localAndSecure')}</span>
          </div>
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
