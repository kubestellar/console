/**
 * Demo-to-Local CTA — shown on console.kubestellar.io to convert demo visitors.
 *
 * GA4 funnel data shows 104 users visit via console.kubestellar.io but 100%
 * abandon at Step 2 (Agent Connected) — they can't connect an agent from
 * the demo site. This CTA provides a clear path to a local install.
 */

import { useState, useEffect, useRef } from 'react'
import { Terminal, Copy, Check, X, Rocket } from 'lucide-react'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import { isNetlifyDeployment, getDemoMode } from '../../lib/demoMode'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import {
  STORAGE_KEY_DEMO_CTA_DISMISSED,
  STORAGE_KEY_HINTS_SUPPRESSED,
} from '../../lib/constants/storage'
import { emitDemoToLocalShown, emitDemoToLocalActioned } from '../../lib/analytics'

const NETLIFY_INSTALL_COMMAND = 'curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash'
const AGENT_INSTALL_COMMAND = 'brew tap kubestellar/tap && brew install --head kc-agent && kc-agent'

/** How many seconds the "Copied!" confirmation shows */
const COPY_FEEDBACK_MS = 2000

export function DemoToLocalCTA() {
  const [dismissed, setDismissed] = useState(
    () => safeGetItem(STORAGE_KEY_DEMO_CTA_DISMISSED) === 'true'
  )
  const [hintsSuppressed] = useState(
    () => safeGetItem(STORAGE_KEY_HINTS_SUPPRESSED) === 'true'
  )
  const [copied, setCopied] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const emittedRef = useRef(false)
  const { status: agentStatus } = useLocalAgent()

  // Show on Netlify (demo site) or on localhost when agent is disconnected and in demo mode
  const isLocalNoAgent = !isNetlifyDeployment && agentStatus === 'disconnected' && getDemoMode()
  const shouldShow = (isNetlifyDeployment || isLocalNoAgent) && !dismissed && !hintsSuppressed

  useEffect(() => {
    if (shouldShow && isNetlifyDeployment && !emittedRef.current) {
      emittedRef.current = true
      emitDemoToLocalShown()
    }
  }, [shouldShow])

  if (!shouldShow) return null

  // Context-aware command and copy
  const installCommand = isNetlifyDeployment ? NETLIFY_INSTALL_COMMAND : AGENT_INSTALL_COMMAND

  const handleDismiss = () => {
    setDismissed(true)
    safeSetItem(STORAGE_KEY_DEMO_CTA_DISMISSED, 'true')
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand)
      setCopied(true)
      emitDemoToLocalActioned('copy_command')
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
    } catch {
      // Clipboard API not available — select the text instead
      const el = document.querySelector('[data-install-command]') as HTMLElement
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }
    }
  }

  const handleDocs = () => {
    emitDemoToLocalActioned('view_docs')
    setShowSetupDialog(true)
  }

  return (
    <div className="mb-4 rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 via-cyan-500/5 to-transparent p-4 animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {isLocalNoAgent ? 'Connect your clusters' : 'Install KubeStellar Console locally to connect your clusters'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLocalNoAgent
                ? 'Install and run kc-agent to connect your real clusters'
                : 'You\u0027re viewing demo data \u2014 install locally to monitor your real clusters'}
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Install command with copy button */}
      <div className="flex items-center gap-2 mb-3">
        <code
          data-install-command
          className="flex-1 px-3 py-2 text-xs font-mono bg-secondary/50 rounded-lg border border-border/50 text-foreground overflow-x-auto whitespace-nowrap"
        >
          {installCommand}
        </code>
        <button
          onClick={handleCopy}
          className={`p-2 rounded-lg border transition-all flex-shrink-0 ${
            copied
              ? 'bg-green-500/20 border-green-500/30 text-green-400'
              : 'bg-secondary/50 border-border/50 hover:border-blue-500/30 text-muted-foreground hover:text-foreground'
          }`}
          title={copied ? 'Copied!' : 'Copy install command'}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">
          Requires macOS, Linux, or WSL with Homebrew
        </span>
        <button
          onClick={handleDocs}
          className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
        >
          Full setup guide <Rocket className="w-3 h-3" />
        </button>
      </div>

      <SetupInstructionsDialog
        isOpen={showSetupDialog}
        onClose={() => setShowSetupDialog(false)}
      />
    </div>
  )
}
