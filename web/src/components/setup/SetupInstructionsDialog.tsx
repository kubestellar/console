'use client'

import { useState } from 'react'
import { Rocket, Copy, Check, Terminal, ExternalLink, ChevronDown, ChevronRight, KeyRound, Server } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { useTranslation } from 'react-i18next'

interface SetupInstructionsDialogProps {
  isOpen: boolean
  onClose: () => void
}

const REPO_URL = 'https://github.com/kubestellar/console'
const DOCS_URL = 'https://console-docs.kubestellar.io'
const CURL_BASE = 'https://raw.githubusercontent.com/kubestellar/console/main'

const QUICKSTART_CMD = `curl -sSL ${CURL_BASE}/start.sh | bash`
const K8S_DEPLOY_CMD = `curl -sSL ${CURL_BASE}/deploy.sh | bash`

const OAUTH_STEPS = [
  { label: 'Go to', link: 'https://github.com/settings/developers', linkText: 'GitHub Developer Settings' },
  { label: 'Click "New OAuth App" and fill in:' },
  { label: 'Application name:', value: 'KubeStellar Console' },
  { label: 'Homepage URL:', value: 'http://localhost:8080' },
  { label: 'Callback URL:', value: 'http://localhost:8080/auth/github/callback' },
  { label: 'Click "Register application", then copy the Client ID and generate a Client Secret' },
  { label: 'Create a .env file in the project root:', command: 'GITHUB_CLIENT_ID=<your-client-id>\nGITHUB_CLIENT_SECRET=<your-client-secret>' },
  { label: 'Restart the console (Ctrl+C, then re-run):', command: 'curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash' },
]

export function SetupInstructionsDialog({ isOpen, onClose }: SetupInstructionsDialogProps) {
  const { t } = useTranslation()
  const [copiedStep, setCopiedStep] = useState<number | null>(null)
  const [showOAuthGuide, setShowOAuthGuide] = useState(false)
  const [showDevGuide, setShowDevGuide] = useState(false)
  const [showK8sGuide, setShowK8sGuide] = useState(false)

  const copyToClipboard = async (text: string, stepKey: number) => {
    await navigator.clipboard.writeText(text)
    setCopiedStep(stepKey)
    setTimeout(() => setCopiedStep(null), 2000)
  }

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
          {/* Architecture note */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
            <div className="flex items-start gap-2.5">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
                <span className="text-blue-400 text-xs font-bold">i</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1.5">
                <p>
                  <span className="text-blue-400 font-medium">console.kubestellar.io is a demo</span> — it shows sample data only.
                  To monitor your real clusters, install the console locally or in a cluster:
                </p>
                <div className="font-mono text-[11px] text-foreground/60 leading-relaxed">
                  <span className="text-blue-400">Browser</span>
                  {' \u2192 '}
                  <span className="text-purple-400">Frontend</span>
                  {' \u2192 '}
                  <span className="text-purple-400">Backend</span>
                  {' \u2192 '}
                  <span className="text-purple-400">kc-agent</span>
                  {' \u2192 '}
                  <span className="text-green-400">Your clusters</span>
                </div>
                <p className="text-muted-foreground/70">
                  The kc-agent reads your kubeconfig and streams live data from all your clusters to the console.
                </p>
              </div>
            </div>
          </div>

          {/* Single-step quickstart */}
          <div className="rounded-lg border border-border/50 bg-secondary/30 p-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Rocket className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm text-foreground">Start the console</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Downloads binaries, starts the backend + agent, and opens your browser — typically under 45 seconds
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                    {QUICKSTART_CMD}
                  </code>
                  <button
                    onClick={() => copyToClipboard(QUICKSTART_CMD, 1)}
                    className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title={t('drilldown.tooltips.copyCommand')}
                  >
                    {copiedStep === 1 ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Dev mode guide */}
                <div className="mt-2">
                  <button
                    onClick={() => setShowDevGuide(!showDevGuide)}
                    className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {showDevGuide ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    <Terminal className="w-3.5 h-3.5" />
                    Or run from source (requires Go, Node.js)
                  </button>
                  {showDevGuide && (
                    <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                          git clone https://github.com/kubestellar/console.git && cd console && ./start-dev.sh
                        </code>
                        <button
                          onClick={() => copyToClipboard('git clone https://github.com/kubestellar/console.git && cd console && ./start-dev.sh', 300)}
                          className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title={t('drilldown.tooltips.copyCommand')}
                        >
                          {copiedStep === 300 ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Requires Go 1.24+ and Node.js 20+. Compiles from source and starts a Vite dev server on port 5174.
                      </p>
                    </div>
                  )}
                </div>

                {/* Kubernetes deploy guide */}
                <div className="mt-2">
                  <button
                    onClick={() => setShowK8sGuide(!showK8sGuide)}
                    className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {showK8sGuide ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    <Server className="w-3.5 h-3.5" />
                    Or deploy to a Kubernetes cluster
                  </button>
                  {showK8sGuide && (
                    <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        One command — requires <code className="font-mono text-foreground/70">helm</code> and <code className="font-mono text-foreground/70">kubectl</code>
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                          {K8S_DEPLOY_CMD}
                        </code>
                        <button
                          onClick={() => copyToClipboard(K8S_DEPLOY_CMD, 400)}
                          className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title={t('drilldown.tooltips.copyCommand')}
                        >
                          {copiedStep === 400 ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Supports <code className="font-mono text-foreground/70">--context</code>, <code className="font-mono text-foreground/70">--openshift</code>, <code className="font-mono text-foreground/70">--ingress &lt;host&gt;</code>, and <code className="font-mono text-foreground/70">--github-oauth</code> flags.
                      </p>
                    </div>
                  )}
                </div>

                {/* OAuth guide */}
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
                    Optional: Enable GitHub OAuth login
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
                                  title={t('common.copy')}
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
