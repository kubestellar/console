'use client'

import { useState, useEffect } from 'react'
import { useLocalAgent } from '@/hooks/useLocalAgent'

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

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-background p-6 shadow-2xl">
        <h2 className="text-xl font-bold">Welcome to KubeStellar Console</h2>
        <p className="mt-2 text-muted-foreground">
          To access your local clusters and Claude Code, install our lightweight agent.
        </p>

        {/* Install Option */}
        <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
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

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex gap-3">
            <button
              onClick={() => handleDismiss(false)}
              className="flex-1 rounded border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Continue with Demo Data
            </button>
            <button
              onClick={handleSnooze}
              className="flex-1 rounded border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Remind Me Later
            </button>
          </div>
          <button
            onClick={() => handleDismiss(true)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Don't show again
          </button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          You can install the agent anytime from Settings.
        </p>
      </div>
    </div>
  )
}
