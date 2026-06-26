'use client'

import { useState, useEffect, useRef } from 'react'
import { Plug, Copy, Check, ChevronDown, ChevronRight, Terminal, Shield, ExternalLink } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'

interface InClusterAgentDialogProps {
  isOpen: boolean
  onClose: () => void
}

const BREW_INSTALL_CMD = 'brew tap kubestellar/tap && brew install kc-agent && kc-agent'
const BUILD_FROM_SOURCE_CMD = 'git clone https://github.com/kubestellar/console.git && cd console && mkdir -p bin && go build -o bin/kc-agent ./cmd/kc-agent && ./bin/kc-agent'
// #6185: Windows users run inside WSL2. Same Linux build path with apt
// prereqs prepended (software-properties-common for add-apt-repository,
// the longsleep PPA for current Go, then the standard build-from-source
// command). The README has the step-by-step version of this.
const WINDOWS_WSL_INSTALL_CMD = 'sudo apt-get update && sudo apt-get install -y software-properties-common curl git && sudo add-apt-repository -y ppa:longsleep/golang-backports && sudo apt-get update && sudo apt-get install -y golang-1.25 && git clone https://github.com/kubestellar/console.git && cd console && mkdir -p bin && go build -o bin/kc-agent ./cmd/kc-agent && ./bin/kc-agent'
const DOCS_URL = 'https://console-docs.kubestellar.io'

/** Step key ranges: 100–199 = install section, 200–299 = CORS section */
const COPY_KEY_BREW = 100
const COPY_KEY_BUILD = 101
const COPY_KEY_WSL = 102
const COPY_KEY_CORS_ENV = 200
const COPY_KEY_CORS_FLAG = 201

export function InClusterAgentDialog({ isOpen, onClose }: InClusterAgentDialogProps) {
  const [copiedStep, setCopiedStep] = useState<number | null>(null)
  const [showBuildFromSource, setShowBuildFromSource] = useState(false)
  const [showWindowsWsl, setShowWindowsWsl] = useState(false)
  const [showCorsDetails, setShowCorsDetails] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://your-console-url'

  const corsEnvCmd = `KC_ALLOWED_ORIGINS=${currentOrigin} kc-agent`
  const corsFlag = `kc-agent -allowed-origins ${currentOrigin}`

  const handleCopy = async (text: string, stepKey: number) => {
    await copyToClipboard(text)
    setCopiedStep(stepKey)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedStep(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title="Connect the kc-agent"
        description="Monitor your real clusters from this console"
        icon={Plug}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <div className="space-y-3">
          {/* Architecture note */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
                <span className="text-blue-400 text-xs font-bold">i</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1.5">
                <p>
                  The console is running <span className="text-blue-400 font-medium">in-cluster</span> but
                  no kc-agent connection was detected. The agent bridges your browser to your Kubernetes clusters:
                </p>
                <div className="font-mono text-[11px] text-foreground/60 leading-relaxed">
                  <span className="text-blue-400">Browser</span>
                  {' \u2192 '}
                  <span className="text-purple-400">Console (in-cluster)</span>
                  {' \u2192 '}
                  <span className="text-green-400">kc-agent</span>
                  {' \u2192 '}
                  <span className="text-green-400">Your clusters</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Install the agent */}
          <div className="rounded-lg border border-border/50 bg-secondary/30 p-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Terminal className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm text-foreground">Option 1: Install the kc-agent</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Run the agent on a machine that has access to your kubeconfig
                </p>

                {/* Brew install */}
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                    {BREW_INSTALL_CMD}
                  </code>
                  <button
                    onClick={() => handleCopy(BREW_INSTALL_CMD, COPY_KEY_BREW)}
                    className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy command"
                  >
                    {copiedStep === COPY_KEY_BREW ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Build from source (collapsible) */}
                <div className="mt-2">
                  <button
                    onClick={() => setShowBuildFromSource(!showBuildFromSource)}
                    className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {showBuildFromSource ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    Or build from source (Linux, requires Go 1.25+)
                  </button>
                  {showBuildFromSource && (
                    <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                          {BUILD_FROM_SOURCE_CMD}
                        </code>
                        <button
                          onClick={() => handleCopy(BUILD_FROM_SOURCE_CMD, COPY_KEY_BUILD)}
                          className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy command"
                        >
                          {copiedStep === COPY_KEY_BUILD ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Windows (WSL2) Install Option (collapsible) — #6185 */}
                <div className="mt-2">
                  <button
                    onClick={() => setShowWindowsWsl(!showWindowsWsl)}
                    className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {showWindowsWsl ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    Windows (WSL2)
                  </button>
                  {showWindowsWsl && (
                    <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Native Windows isn&apos;t supported. Install WSL2 with Ubuntu first
                        (<code className="px-1 rounded bg-muted">wsl --install -d Ubuntu</code> in PowerShell), then
                        run this single command inside the WSL shell. Open <code className="px-1 rounded bg-muted">http://localhost:8080</code> in
                        your Windows browser when done — WSL2 forwards localhost automatically.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                          {WINDOWS_WSL_INSTALL_CMD}
                        </code>
                        <button
                          onClick={() => handleCopy(WINDOWS_WSL_INSTALL_CMD, COPY_KEY_WSL)}
                          className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy command"
                        >
                          {copiedStep === COPY_KEY_WSL ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  The agent reads your kubeconfig and streams live cluster data to this console.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Configure CORS */}
          <div className="rounded-lg border border-border/50 bg-secondary/30 p-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm text-foreground">Option 2: Already have an agent?</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  If you already installed the kc-agent but the console can&apos;t connect, your agent
                  likely needs to allow this origin in its CORS configuration.
                </p>

                {/* CORS env var */}
                <p className="text-xs text-muted-foreground mb-1">
                  Set the <code className="font-mono text-foreground/70">KC_ALLOWED_ORIGINS</code> environment variable:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                    {corsEnvCmd}
                  </code>
                  <button
                    onClick={() => handleCopy(corsEnvCmd, COPY_KEY_CORS_ENV)}
                    className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy command"
                  >
                    {copiedStep === COPY_KEY_CORS_ENV ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Or CLI flag */}
                <p className="text-xs text-muted-foreground mt-2 mb-1">
                  Or use the CLI flag:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                    {corsFlag}
                  </code>
                  <button
                    onClick={() => handleCopy(corsFlag, COPY_KEY_CORS_FLAG)}
                    className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy command"
                  >
                    {copiedStep === COPY_KEY_CORS_FLAG ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* CORS details (collapsible) */}
                <div className="mt-2">
                  <button
                    onClick={() => setShowCorsDetails(!showCorsDetails)}
                    className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    {showCorsDetails ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    Why is CORS needed?
                  </button>
                  {showCorsDetails && (
                    <div className="mt-2 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-xs text-muted-foreground space-y-1.5">
                      <p>
                        When the console runs in a cluster, your browser connects directly to the kc-agent
                        via HTTP/WebSocket. Browsers block these cross-origin requests unless the agent
                        explicitly allows the console&apos;s origin.
                      </p>
                      <p>
                        By default, the agent allows connections from <code className="font-mono text-foreground/70">localhost</code>,{' '}
                        <code className="font-mono text-foreground/70">127.0.0.1</code>, and{' '}
                        <code className="font-mono text-foreground/70">console.kubestellar.io</code>.
                        For custom domains or ingress URLs, add your origin with{' '}
                        <code className="font-mono text-foreground/70">KC_ALLOWED_ORIGINS</code>.
                      </p>
                      <p>
                        Multiple origins can be comma-separated:{' '}
                        <code className="font-mono text-foreground/70">KC_ALLOWED_ORIGINS=https://a.example.com,https://b.example.com</code>
                      </p>
                    </div>
                  )}
                </div>
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
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Current origin: <code className="font-mono text-foreground/70">{currentOrigin}</code>
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
