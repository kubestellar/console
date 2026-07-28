'use client'

import { useState, useEffect, useRef } from 'react'
import { Rocket, Terminal, ExternalLink, KeyRound, Server, Shield } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { emitInstallCommandCopied } from '../../lib/analytics'
import { copyToClipboard } from '../../lib/clipboard'
import { CopyableCommand } from './CopyableCommand'
import { InstructionStepCard } from './InstructionStepCard'

interface SetupInstructionsDialogProps {
  isOpen: boolean
  onClose: () => void
}

const REPO_URL = 'https://github.com/kubestellar/console'
const DOCS_URL = 'https://console-docs.kubestellar.io'
// Rendered docs site for the Console security model (shown alongside
// the source-grounded repo version and the AI-specific threat model).
const SECURITY_DOC_URL = 'https://kubestellar.io/docs/console/main/console/security-model/'
const SECURITY_DOC_REPO_URL = 'https://github.com/kubestellar/console/blob/main/docs/security/SECURITY-MODEL.md'
const SECURITY_AI_DOC_URL = 'https://github.com/kubestellar/console/blob/main/docs/security/SECURITY-AI.md'
const CURL_BASE = 'https://raw.githubusercontent.com/kubestellar/console/main'

const QUICKSTART_CMD = `curl -sSL ${CURL_BASE}/start.sh | bash`
const K8S_DEPLOY_CMD = `curl -sSL ${CURL_BASE}/deploy.sh | bash`

/** Index of the "Restart the console" step — the last OAuth step */
const OAUTH_RESTART_STEP_IDX = 7
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
  const [showSecurity, setShowSecurity] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const handleCopy = async (text: string, stepKey: number) => {
    await copyToClipboard(text)
    setCopiedStep(stepKey)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedStep(null), UI_FEEDBACK_TIMEOUT_MS)
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
              <div className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
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
                  stepKey={1}
                  copiedStep={copiedStep}
                  onCopy={(cmd, key) => { void handleCopy(cmd, key); emitInstallCommandCopied('setup_quickstart', cmd) }}
                />

                <InstructionStepCard
                  icon={Terminal}
                  label="Or run from source (requires Go, Node.js)"
                  isOpen={showDevGuide}
                  onToggle={() => setShowDevGuide(!showDevGuide)}
                >
                  <CopyableCommand
                    command="git clone https://github.com/kubestellar/console.git && cd console && ./start-dev.sh"
                    stepKey={300}
                    copiedStep={copiedStep}
                    onCopy={(cmd, key) => { void handleCopy(cmd, key); emitInstallCommandCopied('setup_dev_mode', cmd) }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Requires Go 1.25+ and Node.js 20+. Compiles from source and starts a Vite dev server on port 5174.
                  </p>
                </InstructionStepCard>

                <InstructionStepCard
                  icon={Server}
                  label="Or deploy to a Kubernetes cluster"
                  isOpen={showK8sGuide}
                  onToggle={() => setShowK8sGuide(!showK8sGuide)}
                >
                  <p className="text-xs text-muted-foreground">
                    One command — requires <code className="font-mono text-foreground/70">helm</code> and <code className="font-mono text-foreground/70">kubectl</code>
                  </p>
                  <CopyableCommand
                    command={K8S_DEPLOY_CMD}
                    stepKey={400}
                    copiedStep={copiedStep}
                    onCopy={(cmd, key) => { void handleCopy(cmd, key); emitInstallCommandCopied('setup_k8s_deploy', cmd) }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Supports <code className="font-mono text-foreground/70">--context</code>, <code className="font-mono text-foreground/70">--openshift</code>, <code className="font-mono text-foreground/70">--ingress &lt;host&gt;</code>, and <code className="font-mono text-foreground/70">--github-oauth</code> flags.
                  </p>
                </InstructionStepCard>

                <InstructionStepCard
                  icon={Shield}
                  label="Security posture — what runs where, what leaves your machine"
                  isOpen={showSecurity}
                  onToggle={() => setShowSecurity(!showSecurity)}
                  containerClassName="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-3 text-xs text-muted-foreground"
                >
                  <div>
                    <p className="font-medium text-foreground mb-1">kc-agent runs on your machine, not ours</p>
                    <p>
                      kc-agent binds <code className="font-mono text-foreground/70">127.0.0.1:8585</code> only
                      (hardcoded loopback, not configurable). It reads{' '}
                      <code className="font-mono text-foreground/70">~/.kube/config</code> and executes every
                      cluster operation as <em>you</em> — the apiserver enforces your real RBAC on every call.
                      Set <code className="font-mono text-foreground/70">KC_AGENT_TOKEN</code> for an additional
                      shared-secret gate against other local processes.
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">AI keys never leave your machine</p>
                    <p>
                      API keys are stored at{' '}
                      <code className="font-mono text-foreground/70">~/.kc/config.yaml</code> with mode{' '}
                      <code className="font-mono text-foreground/70">0600</code>. The browser never holds the
                      keys; kc-agent calls the provider directly. No API key reaches the console's servers or
                      the hosted demo at console.kubestellar.io.
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">What does leave your machine</p>
                    <p>
                      Your AI chat history and prompts are sent to whichever LLM provider you configured —
                      cloud (Anthropic, OpenAI, Gemini) or self-hosted. Your kubeconfig, cluster tokens, and
                      secrets are <em>not</em> auto-attached; only what you paste into the chat. Analytics
                      (page views, feature-use events) can be opted out in Settings.
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">Air-gapped / high-security environments</p>
                    <p>
                      Point kc-agent at a local LLM (Ollama, vLLM, LM Studio, corporate gateway) by overriding{' '}
                      <code className="font-mono text-foreground/70">GROQ_BASE_URL</code>,{' '}
                      <code className="font-mono text-foreground/70">OPENROUTER_BASE_URL</code>, or{' '}
                      <code className="font-mono text-foreground/70">OPEN_WEBUI_URL</code>. AI traffic then
                      never leaves your perimeter. The core cluster-management UX works with no AI at all.
                    </p>
                  </div>
                  <div className="pt-1 flex flex-col gap-1">
                    <a href={SECURITY_DOC_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300">
                      Read the full security model (kubestellar.io)<ExternalLink className="w-3 h-3" />
                    </a>
                    <a href={SECURITY_AI_DOC_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300">
                      AI automation threat model (SECURITY-AI.md)<ExternalLink className="w-3 h-3" />
                    </a>
                    <a href={SECURITY_DOC_REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      Source-grounded version on GitHub<ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </InstructionStepCard>

                <InstructionStepCard
                  icon={KeyRound}
                  label="Optional: Enable GitHub OAuth login"
                  isOpen={showOAuthGuide}
                  onToggle={() => setShowOAuthGuide(!showOAuthGuide)}
                >
                  {OAUTH_STEPS.map((oStep, idx) => (
                    <div key={idx} className="text-xs">
                      {oStep.link ? (
                        <span className="text-muted-foreground">
                          {idx + 1}. {oStep.label}{' '}
                          <a href={oStep.link} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">
                            {oStep.linkText}
                          </a>
                        </span>
                      ) : oStep.value ? (
                        <div className="flex items-center gap-2 ml-4">
                          <span className="text-muted-foreground shrink-0">{oStep.label}</span>
                          <code className="rounded bg-muted px-2 py-0.5 font-mono text-foreground select-all">{oStep.value}</code>
                        </div>
                      ) : oStep.command ? (
                        <div className="ml-4 mt-1">
                          <span className="text-muted-foreground">{idx + 1}. {oStep.label}</span>
                          <div className="mt-1">
                            <CopyableCommand
                              command={oStep.command}
                              stepKey={200 + idx}
                              copiedStep={copiedStep}
                              onCopy={(cmd, key) => { void handleCopy(cmd, key); emitInstallCommandCopied(idx === OAUTH_RESTART_STEP_IDX ? 'setup_oauth_restart' : 'setup_oauth_env', cmd) }}
                              title={t('common.copy')}
                              multiline
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{idx + 1}. {oStep.label}</span>
                      )}
                    </div>
                  ))}
                </InstructionStepCard>
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
