import { COPY_FEEDBACK_TIMEOUT_MS } from '../lib/constants'
import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Brain,
  Eye,
  Bell,
  Layers,
  Activity,
  Network,
  Sparkles,
  ExternalLink,
  Copy,
  Check } from 'lucide-react'
import { copyToClipboard } from '../lib/clipboard'
import { emitInstallCommandCopied } from '../lib/analytics'
import { ROUTES } from '../config/routes'


/* ------------------------------------------------------------------ */
/*  Comparison table data                                              */
/* ------------------------------------------------------------------ */

interface ComparisonRow {
  feature: string
  holmesgpt: string | boolean
  console: string | boolean
  consoleNote?: string
}

const COMPARISON_DATA: ComparisonRow[] = [
  { feature: 'Open Source', holmesgpt: true, console: true, consoleNote: 'Apache 2.0' },
  { feature: 'Multi-cluster', holmesgpt: false, console: true, consoleNote: 'Native multi-cluster' },
  { feature: 'Root Cause Analysis', holmesgpt: true, console: true, consoleNote: 'AI-powered per alert' },
  { feature: 'Investigation Runbooks', holmesgpt: true, console: true, consoleNote: 'Built-in + custom' },
  { feature: 'AI Provider Choice', holmesgpt: 'OpenAI, Azure', console: true, consoleNote: 'Claude, OpenAI, Gemini' },
  { feature: 'Alerting & Notifications', holmesgpt: 'Via integrations', console: true, consoleNote: 'Built-in (PD, OG, Slack)' },
  { feature: 'Dashboard & Visualization', holmesgpt: false, console: true, consoleNote: '140+ cards' },
  { feature: 'eBPF Observability', holmesgpt: 'Via IG toolset', console: true, consoleNote: 'Inspektor Gadget cards' },
  { feature: 'Event Correlation', holmesgpt: false, console: true, consoleNote: 'Cross-cluster' },
  { feature: 'Cascade Failure Analysis', holmesgpt: false, console: true, consoleNote: 'Visual impact maps' },
  { feature: 'PagerDuty Integration', holmesgpt: true, console: true, consoleNote: 'Native + auto-resolve' },
  { feature: 'OpsGenie Integration', holmesgpt: true, console: true, consoleNote: 'Native + auto-resolve' },
  { feature: 'Security Posture', holmesgpt: false, console: true, consoleNote: 'RBAC, policies, audit' },
  { feature: 'GitOps Monitoring', holmesgpt: false, console: true, consoleNote: 'ArgoCD, Flux, Helm' },
  { feature: 'GPU/AI Workloads', holmesgpt: false, console: true, consoleNote: 'Built-in' },
  { feature: 'Config Drift Detection', holmesgpt: false, console: true, consoleNote: 'Heatmap visualization' },
  { feature: 'Guided Install Missions', holmesgpt: false, console: true, consoleNote: '250+ CNCF projects' },
  { feature: 'Demo Mode', holmesgpt: false, console: true, consoleNote: 'Try without a cluster' },
]

/* ------------------------------------------------------------------ */
/*  Highlight features                                                 */
/* ------------------------------------------------------------------ */

interface HighlightFeature {
  icon: React.ReactNode
  title: string
  description: string
}

const HIGHLIGHTS: HighlightFeature[] = [
  {
    icon: <Brain className="w-6 h-6 text-purple-400" />,
    title: 'AI Diagnosis Per Alert',
    description: 'Every alert can be analyzed by Claude, OpenAI, or Gemini. Get root cause analysis, remediation steps, and confidence scoring — not just a log dump.' },
  {
    icon: <Layers className="w-6 h-6 text-purple-400" />,
    title: 'Investigation Runbooks',
    description: 'Structured evidence-gathering before AI reasoning. Runbooks systematically collect kubectl data, IG traces, and metrics — then feed it all to the LLM.' },
  {
    icon: <Eye className="w-6 h-6 text-purple-400" />,
    title: 'Multi-cluster Visibility',
    description: 'See all your clusters in one place. Cross-cluster event correlation, cascade impact maps, and config drift detection across your entire fleet.' },
  {
    icon: <Network className="w-6 h-6 text-purple-400" />,
    title: 'Inspektor Gadget eBPF',
    description: 'Kernel-level observability baked into the dashboard. Network traces, DNS monitoring, process execution, and seccomp audit — zero instrumentation.' },
  {
    icon: <Bell className="w-6 h-6 text-purple-400" />,
    title: 'Enterprise Alerting',
    description: 'PagerDuty and OpsGenie native integration with auto-resolution. Plus Slack, email, webhooks, and browser notifications.' },
  {
    icon: <Activity className="w-6 h-6 text-purple-400" />,
    title: '140+ Dashboard Cards',
    description: 'Monitoring, security, compliance, GitOps, GPU, cost analytics — all in customizable dashboards. HolmesGPT shows you root causes; we show you everything.' },
]

/* ------------------------------------------------------------------ */
/*  What migrates section                                              */
/* ------------------------------------------------------------------ */

interface MigrationItem {
  from: string
  to: string
  description: string
}

const MIGRATION_ITEMS: MigrationItem[] = [
  {
    from: 'HolmesGPT runbooks',
    to: 'Investigation Runbooks',
    description: 'Your YAML/markdown runbooks translate directly to our runbook format. Same concept: trigger conditions, evidence steps, analysis prompts.' },
  {
    from: 'HolmesGPT toolsets',
    to: 'MCP Bridge + IG integration',
    description: 'kubectl and IG tools are available natively. Custom toolsets can be wrapped as MCP servers.' },
  {
    from: 'PagerDuty/OpsGenie alerts',
    to: 'Native PD/OG channels',
    description: 'Configure routing keys and API keys in Settings. Alerts auto-trigger and auto-resolve incidents.' },
  {
    from: 'OpenAI API key',
    to: 'Multi-provider AI',
    description: 'Bring your OpenAI key, or switch to Claude or Gemini. All providers work with diagnosis, insights, and chat.' },
]

/* ------------------------------------------------------------------ */
/*  Install steps                                                      */
/* ------------------------------------------------------------------ */

interface InstallStep {
  step: number
  title: string
  commands?: string[]
  note?: string
  description: string
}

const INSTALL_STEPS: InstallStep[] = [
  {
    step: 1,
    title: 'Install and run',
    commands: [
      'curl -sSL \\',
      '  https://raw.githubusercontent.com/kubestellar/console/main/start.sh \\',
      '  | bash',
    ],
    description: 'Downloads pre-built binaries, starts the console and kc-agent, and opens your browser. No build tools required.' },
  {
    step: 2,
    title: 'Add your AI provider',
    description: 'Go to Settings and add your OpenAI, Claude, or Gemini API key. AI diagnosis works with any provider.' },
  {
    step: 3,
    title: 'Configure alerts',
    description: 'Create alert rules with PagerDuty or OpsGenie channels. Your existing integration keys work directly.' },
]

/* ------------------------------------------------------------------ */
/*  Helper components                                                  */
/* ------------------------------------------------------------------ */

function ComparisonCell({ value, note, isConsole }: { value: string | boolean; note?: string; isConsole?: boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="inline-flex items-center gap-1.5">
        <CheckCircle2 className={`w-5 h-5 ${isConsole ? 'text-green-400' : 'text-muted-foreground'}`} />
        <span className="sr-only">Yes</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5">
        <XCircle className="w-5 h-5 text-red-400/70" />
        <span className="sr-only">No</span>
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col">
      <span className={isConsole ? 'text-green-400 font-medium' : 'text-slate-300'}>{value}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export function FromHolmesGPT() {
  const [copiedStep, setCopiedStep] = useState<string | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    document.title = 'KubeStellar Console — Switching from HolmesGPT'
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const copyCommands = async (commands: string[], step: number) => {
    const text = commands.filter(c => !c.startsWith('#') && c !== '').join('\n')
    const ok = await copyToClipboard(text)
    if (!ok) return
    setCopiedStep(`step-${step}`)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedStep(null), COPY_FEEDBACK_TIMEOUT_MS)
    const firstCommand = commands.find(c => !c.startsWith('#') && c !== '') ?? commands[0]
    emitInstallCommandCopied('from_holmesgpt', firstCommand)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-purple-500/5 via-transparent to-transparent" />
        <div className="relative max-w-5xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm mb-6">
            <Brain className="w-4 h-4" />
            Switching from HolmesGPT
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Everything HolmesGPT does,{' '}
            <span className="bg-linear-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              plus 140+ dashboard cards
            </span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
            KubeStellar Console includes AI-powered root cause analysis, investigation runbooks,
            PagerDuty/OpsGenie integration, and Inspektor Gadget eBPF tracing —
            wrapped in a multi-cluster dashboard with real-time visibility.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              to={ROUTES.HOME}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 transition-colors"
            >
              Try the Dashboard
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-slate-700 text-slate-300 font-medium hover:bg-slate-800 transition-colors"
            >
              GitHub
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          Side-by-side comparison
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/30">
                <th className="text-left p-4 font-medium text-slate-400">Feature</th>
                <th className="text-left p-4 font-medium text-slate-400">HolmesGPT</th>
                <th className="text-left p-4 font-medium text-purple-400">KubeStellar Console</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_DATA.map((row, i) => (
                <tr key={row.feature} className={`border-b border-slate-800/50 ${i % 2 === 0 ? 'bg-slate-900/20' : ''}`}>
                  <td className="p-4 font-medium text-slate-200">{row.feature}</td>
                  <td className="p-4">
                    <ComparisonCell value={row.holmesgpt} />
                  </td>
                  <td className="p-4">
                    <ComparisonCell value={row.console} note={row.consoleNote} isConsole />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Highlights Grid */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          What you get with the console
        </h2>
        <p className="text-slate-400 text-center mb-12">
          Beyond root cause analysis — full operational visibility.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {HIGHLIGHTS.map(({ icon, title, description }) => (
            <div key={title} className="p-6 rounded-xl border border-slate-700/50 bg-slate-900/30 hover:bg-slate-900/50 transition-colors">
              <div className="mb-3">{icon}</div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-sm text-slate-400">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Migration Guide */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          Migration path
        </h2>
        <p className="text-slate-400 text-center mb-12">
          Your HolmesGPT concepts map directly to the console.
        </p>
        <div className="space-y-4">
          {MIGRATION_ITEMS.map(({ from, to, description }) => (
            <div key={from} className="p-5 rounded-xl border border-slate-700/50 bg-slate-900/30">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300">{from}</span>
                <ArrowRight className="w-4 h-4 text-purple-400" />
                <span className="px-2 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400 font-medium">{to}</span>
              </div>
              <p className="text-sm text-slate-400">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Install Steps */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          Get started in{' '}
          <span className="text-purple-400">60 seconds</span>
        </h2>
        <p className="text-slate-400 text-center mb-12">
          No sign-up, no license file. Just curl and a kubeconfig.
        </p>
        <div className="max-w-3xl mx-auto space-y-6">
          {INSTALL_STEPS.map((s) => (
            <div key={s.step} className="p-5 rounded-xl border border-slate-700/50 bg-slate-900/30">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-400 font-bold text-sm flex items-center justify-center">
                  {s.step}
                </span>
                <h3 className="font-semibold">{s.title}</h3>
              </div>
              {s.commands && (
                <div className="relative mb-3">
                  <pre className="p-4 rounded-lg bg-slate-950 text-slate-300 text-sm font-mono overflow-x-auto">
                    {s.commands.join('\n')}
                  </pre>
                  <button
                    onClick={() => copyCommands(s.commands!, s.step)}
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors"
                    aria-label="Copy commands"
                  >
                    {copiedStep === `step-${s.step}` ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </div>
              )}
              {s.note && (
                <div className="mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
                  {s.note}
                </div>
              )}
              <p className="text-sm text-slate-400">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Ready to switch?
        </h2>
        <p className="text-slate-400 mb-8 max-w-xl mx-auto">
          The console gives you everything HolmesGPT does for incident investigation,
          plus the multi-cluster dashboard, eBPF tracing, and 140+ monitoring cards you've been missing.
        </p>
        <Link
          to={ROUTES.HOME}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-purple-500 text-white font-medium text-lg hover:bg-purple-600 transition-colors"
        >
          <Sparkles className="w-5 h-5" />
          Open the Console
        </Link>
      </section>
    </div>
  )
}
