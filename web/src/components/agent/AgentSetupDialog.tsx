'use client'

import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import { useLocalAgent } from '@/hooks/useLocalAgent'
import { BaseModal } from '../../lib/modals'

const DISMISSED_KEY = 'kkc-agent-setup-dismissed'
const SNOOZED_KEY = 'kkc-agent-setup-snoozed'
const SNOOZE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export function AgentSetupDialog() {
  const { status, isConnected } = useLocalAgent()
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)

  const installCommand = 'brew install kubestellar/tap/kkc-agent && kkc-agent'

  useEffect(() => {
    // Only show after initial connection check completes
    if (status === 'connecting') return

    // Don't show if already connected
    if (isConnected) return

    // Check if user previously dismissed permanently
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (dismissed) return

    // Check if snoozed and still within snooze period
    const snoozedUntil = localStorage.getItem(SNOOZED_KEY)
    if (snoozedUntil && Date.now() < parseInt(snoozedUntil)) return

    // Show the dialog
    setShow(true)
  }, [status, isConnected])

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(installCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSnooze = () => {
    localStorage.setItem(SNOOZED_KEY, String(Date.now() + SNOOZE_DURATION))
    setShow(false)
  }

  const handleDismiss = (rememberChoice: boolean) => {
    if (rememberChoice) {
      localStorage.setItem(DISMISSED_KEY, 'true')
    }
    setShow(false)
  }

  return (
    <BaseModal isOpen={show} onClose={() => handleDismiss(false)} size="md">
      <BaseModal.Header
        title="Welcome to KubeStellar Console"
        description="To access your local clusters and Claude Code, install our lightweight agent."
        icon={Download}
        onClose={() => handleDismiss(false)}
        showBack={false}
      />

      <BaseModal.Content>
        {/* Install Option */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="font-medium">Quick Install (recommended)</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Copy this command and run it in your terminal:
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono select-all overflow-x-auto">
              {installCommand}
            </code>
            <button
              onClick={copyToClipboard}
              className="shrink-0 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>✓ Your kubeconfig clusters</span>
            <span>✓ Real-time token usage</span>
            <span>✓ Local & secure</span>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          You can install the agent anytime from Settings.
        </p>
      </BaseModal.Content>

      <BaseModal.Footer>
        <button
          onClick={() => handleDismiss(true)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Don't show again
        </button>
        <div className="flex-1" />
        <div className="flex gap-3">
          <button
            onClick={() => handleDismiss(false)}
            className="rounded border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Continue with Demo Data
          </button>
          <button
            onClick={handleSnooze}
            className="rounded border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Remind Me Later
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
