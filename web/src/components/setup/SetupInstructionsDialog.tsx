'use client'

import { useState } from 'react'
import { Rocket, Copy, Check, Terminal, Globe, ExternalLink, ChevronDown, ChevronRight, KeyRound } from 'lucide-react'
import { BaseModal } from '../../lib/modals'

interface SetupInstructionsDialogProps {
  isOpen: boolean
  onClose: () => void
}

const REPO_URL = 'https://github.com/kubestellar/console'
const DOCS_URL = 'https://console-docs.kubestellar.io'

const CURL_BASE = 'https://raw.githubusercontent.com/kubestellar/console/main'

const STEPS = [
  {
    number: 1,
    title: 'Start the console',
    description: 'Clones the repo, installs dependencies, and starts all services',
    command: `curl -sSL ${CURL_BASE}/start-dev.sh | bash`,
    altCommand: `curl -sSL ${CURL_BASE}/startup-oauth.sh | bash`,
    altLabel: 'With GitHub OAuth login',
    icon: Rocket,
    hasOAuthGuide: true,
    hasManualGuide: true,
  },
  {
    number: 2,
    title: 'Open the console',
    description: 'Access your local KubeStellar Console',
    command: 'open http://localhost:5174',
    icon: Globe,
  },
] as const

const OAUTH_STEPS = [
  { label: 'Go to', link: 'https://github.com/settings/developers', linkText: 'GitHub Developer Settings' },
  { label: 'Click "New OAuth App" and fill in:' },
  { label: 'Application name:', value: 'KubeStellar Console' },
  { label: 'Homepage URL:', value: 'http://localhost:5174' },
  { label: 'Callback URL:', value: 'http://localhost:5174/auth/github/callback' },
  { label: 'Click "Register application", then copy the Client ID and generate a Client Secret' },
  { label: 'Create a .env file in the project root:', command: 'GITHUB_CLIENT_ID=<your-client-id>\nGITHUB_CLIENT_SECRET=<your-client-secret>' },
]

export function SetupInstructionsDialog({ isOpen, onClose }: SetupInstructionsDialogProps) {
  const [copiedStep, setCopiedStep] = useState<number | null>(null)
  const [showOAuthGuide, setShowOAuthGuide] = useState(false)
  const [showManualGuide, setShowManualGuide] = useState(false)

  const copyToClipboard = async (text: string, stepKey: number) => {
    await navigator.clipboard.writeText(text)
    setCopiedStep(stepKey)
    setTimeout(() => setCopiedStep(null), 2000)
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title="Run KubeStellar Console Locally"
        description="Connect your own clusters in 2 steps"
        icon={Rocket}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <div className="space-y-3">
          {STEPS.map((step) => {
            const Icon = step.icon
            return (
              <div
                key={step.number}
                className="rounded-lg border border-border/50 bg-secondary/30 p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <span className="text-sm font-bold text-purple-400">{step.number}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm text-foreground">{step.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{step.description}</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                        {step.command}
                      </code>
                      <button
                        onClick={() => copyToClipboard(step.command, step.number)}
                        className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy command"
                      >
                        {copiedStep === step.number ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    {'altCommand' in step && step.altCommand && (
                      <div className="mt-2">
                        <span className="text-xs text-muted-foreground">
                          {'altLabel' in step ? step.altLabel : 'Alternative'}:
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                            {step.altCommand}
                          </code>
                          <button
                            onClick={() => copyToClipboard(step.altCommand, step.number + 100)}
                            className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy command"
                          >
                            {copiedStep === step.number + 100 ? (
                              <Check className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                    {'hasManualGuide' in step && step.hasManualGuide && (
                      <div className="mt-2">
                        <button
                          onClick={() => setShowManualGuide(!showManualGuide)}
                          className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          {showManualGuide ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          <Terminal className="w-3.5 h-3.5" />
                          Or clone manually
                        </button>
                        {showManualGuide && (
                          <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                                git clone https://github.com/kubestellar/console.git && cd console && ./start-dev.sh
                              </code>
                              <button
                                onClick={() => copyToClipboard('git clone https://github.com/kubestellar/console.git && cd console && ./start-dev.sh', 300)}
                                className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Copy command"
                              >
                                {copiedStep === 300 ? (
                                  <Check className="w-3.5 h-3.5 text-green-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              The script automatically installs the local agent via Homebrew.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    {'hasOAuthGuide' in step && step.hasOAuthGuide && (
                      <div className="mt-2">
                        <button
                          onClick={() => setShowOAuthGuide(!showOAuthGuide)}
                          className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          {showOAuthGuide ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          <KeyRound className="w-3.5 h-3.5" />
                          How to set up GitHub OAuth
                        </button>
                        {showOAuthGuide && (
                          <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                            {OAUTH_STEPS.map((oStep, idx) => (
                              <div key={idx} className="text-xs">
                                {oStep.link ? (
                                  <span className="text-muted-foreground">
                                    {idx + 1}. {oStep.label}{' '}
                                    <a
                                      href={oStep.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-purple-400 hover:text-purple-300 underline"
                                    >
                                      {oStep.linkText}
                                    </a>
                                  </span>
                                ) : oStep.value ? (
                                  <div className="flex items-center gap-2 ml-4">
                                    <span className="text-muted-foreground shrink-0">{oStep.label}</span>
                                    <code className="rounded bg-muted px-2 py-0.5 font-mono text-foreground select-all">
                                      {oStep.value}
                                    </code>
                                  </div>
                                ) : oStep.command ? (
                                  <div className="ml-4 mt-1">
                                    <span className="text-muted-foreground">{idx + 1}. {oStep.label}</span>
                                    <div className="flex items-center gap-2 mt-1">
                                      <pre className="flex-1 rounded bg-muted px-3 py-1.5 font-mono text-foreground select-all overflow-x-auto whitespace-pre">
                                        {oStep.command}
                                      </pre>
                                      <button
                                        onClick={() => copyToClipboard(oStep.command, 200 + idx)}
                                        className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors self-start"
                                        title="Copy"
                                      >
                                        {copiedStep === 200 + idx ? (
                                          <Check className="w-3.5 h-3.5 text-green-400" />
                                        ) : (
                                          <Copy className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">
                                    {idx + 1}. {oStep.label}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
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
          Prerequisites: Go 1.22+, Node.js 18+, Homebrew, curl
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
