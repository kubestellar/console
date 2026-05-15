import { useEffect, useRef, useState } from 'react'
import { Globe, KeyRound, Lock, Monitor, Terminal, Wifi } from 'lucide-react'

import { COPY_FEEDBACK_TIMEOUT_MS } from '../../lib/constants'
import { copyToClipboard } from '../../lib/clipboard'
import { emitInstallCommandCopied } from '../../lib/analytics'
import type { InstallCopySource } from '../../lib/analytics-types'
import { InstallStepCard, type InstallStep } from './InstallStepCard'
import { ACCENT_CLASSES, type AccentColor } from './styles'

export type DeployTab = 'localhost' | 'cluster-portforward' | 'cluster-ingress'

interface TabbedDeploySectionProps {
  accentColor: AccentColor
  title: string
  subtitle: string
  localhostSteps: InstallStep[]
  portForwardSteps: InstallStep[]
  ingressSteps: InstallStep[]
  analyticsSource: InstallCopySource
  onTabSwitch?: (tab: DeployTab) => void
  onCommandCopy?: (tab: DeployTab, step: number, command: string) => void
}

export function TabbedDeploySection({
  accentColor,
  title,
  subtitle,
  localhostSteps,
  portForwardSteps,
  ingressSteps,
  analyticsSource,
  onTabSwitch,
  onCommandCopy,
}: TabbedDeploySectionProps) {
  const accent = ACCENT_CLASSES[accentColor]
  const [activeTab, setActiveTab] = useState<DeployTab>('localhost')
  const [copiedStep, setCopiedStep] = useState<string | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(copiedTimerRef.current), [])

  const switchTab = (tab: DeployTab) => {
    if (tab === activeTab) return
    setActiveTab(tab)
    onTabSwitch?.(tab)
  }

  const copyCommands = async (commands: string[], step: number) => {
    const text = commands.filter(command => !command.startsWith('#') && command !== '').join('\n')
    const ok = await copyToClipboard(text)
    if (!ok) return

    const key = `${activeTab}-${step}`
    setCopiedStep(key)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedStep(null), COPY_FEEDBACK_TIMEOUT_MS)

    const firstCommand = commands.find(command => !command.startsWith('#') && command !== '') ?? commands[0]
    onCommandCopy?.(activeTab, step, firstCommand)
    emitInstallCommandCopied(analyticsSource, firstCommand)
  }

  const steps = activeTab === 'localhost'
    ? localhostSteps
    : activeTab === 'cluster-portforward'
      ? portForwardSteps
      : ingressSteps

  const isCluster = activeTab === 'cluster-portforward' || activeTab === 'cluster-ingress'

  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center mb-4">
        {title}{' '}
        <span className={accent.text}>60 seconds</span>
      </h2>
      <p className="text-slate-400 text-center mb-12">
        {subtitle}
      </p>

      <div className="max-w-3xl mx-auto mb-8">
        <div className="flex rounded-lg border border-slate-700/50 overflow-hidden">
          <button
            onClick={() => switchTab('localhost')}
            className={`flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium transition-colors ${
              activeTab === 'localhost'
                ? accent.tabActive
                : 'bg-slate-800/30 text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <Monitor className="w-4 h-4" />
            Localhost
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">curl | bash</span>
          </button>
          <button
            onClick={() => switchTab('cluster-portforward')}
            className={`flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium transition-colors ${
              activeTab === 'cluster-portforward'
                ? accent.tabActive
                : 'bg-slate-800/30 text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Cluster
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">port-forward</span>
          </button>
          <button
            onClick={() => switchTab('cluster-ingress')}
            className={`flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium transition-colors ${
              activeTab === 'cluster-ingress'
                ? accent.tabActive
                : 'bg-slate-800/30 text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <Globe className="w-4 h-4" />
            Cluster
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">ingress / route</span>
          </button>
        </div>
      </div>

      <div className="space-y-6 max-w-3xl mx-auto">
        {steps.map(step => {
          const copyKey = `${activeTab}-${step.step}`
          return (
            <InstallStepCard
              key={copyKey}
              step={step}
              copyKey={copyKey}
              isCopied={copiedStep === copyKey}
              onCopy={copyCommands}
              accentColor={accentColor}
            />
          )
        })}
      </div>

      <div className="mt-8 max-w-3xl mx-auto">
        {!isCluster ? (
          <div className="text-center">
            <p className="text-slate-400 text-sm">
              The agent auto-detects your standard <code className={`${accent.text300} bg-slate-800 px-1.5 py-0.5 rounded`}>~/.kube/config</code> and discovers all contexts.
              No manual cluster registration needed.
            </p>
          </div>
        ) : (
          <div className={`rounded-xl border ${accent.borderLight} ${accent.bgLightest} p-6`}>
            <h4 className={`font-semibold text-sm mb-4 ${accent.text300}`}>For the full experience</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <Lock className={`w-4 h-4 ${accent.text} mt-0.5 shrink-0`} />
                <div>
                  <p className="text-sm font-medium text-slate-200">TLS</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Add a TLS certificate to your ingress for HTTPS. Required for secure WebSocket connections to the kc-agent.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <KeyRound className={`w-4 h-4 ${accent.text} mt-0.5 shrink-0`} />
                <div>
                  <p className="text-sm font-medium text-slate-200">OAuth</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure GitHub OAuth for multi-user authentication. Set{' '}
                    <code className={`${accent.text300_80} bg-slate-800 px-1 rounded`}>GITHUB_CLIENT_ID</code> and{' '}
                    <code className={`${accent.text300_80} bg-slate-800 px-1 rounded`}>GITHUB_CLIENT_SECRET</code> in the Helm values.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Wifi className={`w-4 h-4 ${accent.text} mt-0.5 shrink-0`} />
                <div>
                  <p className="text-sm font-medium text-slate-200">CORS</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Set{' '}
                    <code className={`${accent.text300_80} bg-slate-800 px-1 rounded`}>KC_ALLOWED_ORIGINS</code> on the kc-agent to your console&apos;s URL so cross-origin requests work from the browser.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default TabbedDeploySection
