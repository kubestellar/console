'use client'

import { useState } from 'react'
import { Rocket, ExternalLink, KeyRound, Server, Shield, Terminal } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import { emitInstallCommandCopied } from '../../lib/analytics'
import { useCopiedStep } from './useCopiedStep'
import { CollapsibleGuide, CopyableCommand } from './SetupInstructionsParts'
import { SetupArchitectureNote } from './SetupArchitectureNote'
import { SetupDevModeGuide, SetupK8sDeployGuide } from './SetupRunModeGuides'
import { SetupSecurityPosture } from './SetupSecurityPosture'
import { SetupOAuthGuide } from './SetupOAuthGuide'
import { DOCS_URL, QUICKSTART_CMD, QUICKSTART_STEP_KEY, REPO_URL } from './setupInstructions.constants'

interface SetupInstructionsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function SetupInstructionsDialog({ isOpen, onClose }: SetupInstructionsDialogProps) {
  const { t } = useTranslation()
  const { copiedStep, handleCopy } = useCopiedStep()
  const [showOAuthGuide, setShowOAuthGuide] = useState(false)
  const [showDevGuide, setShowDevGuide] = useState(false)
  const [showK8sGuide, setShowK8sGuide] = useState(false)
  const [showSecurity, setShowSecurity] = useState(false)

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title="Run KubeStellar Console Locally"
        description="Up and running in under a minute — just curl"
        icon={Rocket}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <div className="space-y-3">
          <SetupArchitectureNote />

          {/* Single-step quickstart */}
          <div className="rounded-lg border border-border/50 bg-secondary/30 p-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Rocket className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm text-foreground">Start the console</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Downloads binaries, starts the backend + agent, and opens your browser — typically under 45 seconds
                </p>
                <CopyableCommand
                  command={QUICKSTART_CMD}
                  isCopied={copiedStep === QUICKSTART_STEP_KEY}
                  copyTitle={t('drilldown.tooltips.copyCommand')}
                  onCopy={() => {
                    handleCopy(QUICKSTART_CMD, QUICKSTART_STEP_KEY)
                    emitInstallCommandCopied('setup_quickstart', QUICKSTART_CMD)
                  }}
                />

                <CollapsibleGuide
                  isOpen={showDevGuide}
                  onToggle={() => setShowDevGuide(!showDevGuide)}
                  icon={Terminal}
                  label="Or run from source (requires Go, Node.js)"
                >
                  <SetupDevModeGuide copiedStep={copiedStep} onCopy={handleCopy} />
                </CollapsibleGuide>

                <CollapsibleGuide
                  isOpen={showK8sGuide}
                  onToggle={() => setShowK8sGuide(!showK8sGuide)}
                  icon={Server}
                  label="Or deploy to a Kubernetes cluster"
                >
                  <SetupK8sDeployGuide copiedStep={copiedStep} onCopy={handleCopy} />
                </CollapsibleGuide>

                <CollapsibleGuide
                  isOpen={showSecurity}
                  onToggle={() => setShowSecurity(!showSecurity)}
                  icon={Shield}
                  label="Security posture — what runs where, what leaves your machine"
                >
                  <SetupSecurityPosture />
                </CollapsibleGuide>

                <CollapsibleGuide
                  isOpen={showOAuthGuide}
                  onToggle={() => setShowOAuthGuide(!showOAuthGuide)}
                  icon={KeyRound}
                  label="Optional: Enable GitHub OAuth login"
                >
                  <SetupOAuthGuide copiedStep={copiedStep} onCopy={handleCopy} />
                </CollapsibleGuide>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-4">
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Documentation
          </a>
          <span className="text-muted-foreground/30">|</span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            GitHub
          </a>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Prerequisites: curl
        </div>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="rounded border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Close
        </button>
      </BaseModal.Footer>
    </BaseModal>
  )
}
