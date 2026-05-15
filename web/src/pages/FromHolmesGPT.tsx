import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, Bell, Brain, Eye, ExternalLink, Layers, Network, Sparkles } from 'lucide-react'

import { COPY_FEEDBACK_TIMEOUT_MS } from '../lib/constants'
import { copyToClipboard } from '../lib/clipboard'
import { emitInstallCommandCopied } from '../lib/analytics'
import { ROUTES } from '../config/routes'
import { ComparisonTable, type ComparisonRow } from '../components/landing/ComparisonTable'
import { HighlightGrid, type HighlightFeature } from '../components/landing/HighlightGrid'
import { InstallStepCard, type InstallStep } from '../components/landing/InstallStepCard'

interface MigrationItem {
  from: string
  to: string
  description: string
}

const COMPARISON_DATA: ComparisonRow[] = [
  { feature: 'Open Source', competitor: true, console: true, consoleNote: 'Apache 2.0' },
  { feature: 'Multi-cluster', competitor: false, console: true, consoleNote: 'Native multi-cluster' },
  { feature: 'Root Cause Analysis', competitor: true, console: true, consoleNote: 'AI-powered per alert' },
  { feature: 'Investigation Runbooks', competitor: true, console: true, consoleNote: 'Built-in + custom' },
  { feature: 'AI Provider Choice', competitor: 'OpenAI, Azure', console: true, consoleNote: 'Claude, OpenAI, Gemini' },
  { feature: 'Alerting & Notifications', competitor: 'Via integrations', console: true, consoleNote: 'Built-in (PD, OG, Slack)' },
  { feature: 'Dashboard & Visualization', competitor: false, console: true, consoleNote: '140+ cards' },
  { feature: 'eBPF Observability', competitor: 'Via IG toolset', console: true, consoleNote: 'Inspektor Gadget cards' },
  { feature: 'Event Correlation', competitor: false, console: true, consoleNote: 'Cross-cluster' },
  { feature: 'Cascade Failure Analysis', competitor: false, console: true, consoleNote: 'Visual impact maps' },
  { feature: 'PagerDuty Integration', competitor: true, console: true, consoleNote: 'Native + auto-resolve' },
  { feature: 'OpsGenie Integration', competitor: true, console: true, consoleNote: 'Native + auto-resolve' },
  { feature: 'Security Posture', competitor: false, console: true, consoleNote: 'RBAC, policies, audit' },
  { feature: 'GitOps Monitoring', competitor: false, console: true, consoleNote: 'ArgoCD, Flux, Helm' },
  { feature: 'GPU/AI Workloads', competitor: false, console: true, consoleNote: 'Built-in' },
  { feature: 'Config Drift Detection', competitor: false, console: true, consoleNote: 'Heatmap visualization' },
  { feature: 'Guided Install Missions', competitor: false, console: true, consoleNote: '250+ CNCF projects' },
  { feature: 'Demo Mode', competitor: false, console: true, consoleNote: 'Try without a cluster' },
]

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

export function FromHolmesGPT() {
  const [copiedStep, setCopiedStep] = useState<string | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    document.title = 'KubeStellar Console — Switching from HolmesGPT'
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const copyCommands = async (commands: string[], step: number) => {
    const text = commands.filter(command => !command.startsWith('#') && command !== '').join('\n')
    const ok = await copyToClipboard(text)
    if (!ok) return
    setCopiedStep(`step-${step}`)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedStep(null), COPY_FEEDBACK_TIMEOUT_MS)
    const firstCommand = commands.find(command => !command.startsWith('#') && command !== '') ?? commands[0]
    emitInstallCommandCopied('from_holmesgpt', firstCommand)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
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

      <ComparisonTable
        rows={COMPARISON_DATA}
        competitorName="HolmesGPT"
        accentColor="purple"
        variant="holmes"
      />

      <HighlightGrid
        title="What you get with the console"
        titleAccent=""
        subtitle="Beyond root cause analysis — full operational visibility."
        highlights={HIGHLIGHTS}
        accentColor="purple"
        variant="holmes"
      />

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

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          Get started in{' '}
          <span className="text-purple-400">60 seconds</span>
        </h2>
        <p className="text-slate-400 text-center mb-12">
          No sign-up, no license file. Just curl and a kubeconfig.
        </p>
        <div className="max-w-3xl mx-auto space-y-6">
          {INSTALL_STEPS.map(step => (
            <InstallStepCard
              key={step.step}
              step={step}
              copyKey={`step-${step.step}`}
              isCopied={copiedStep === `step-${step.step}`}
              onCopy={copyCommands}
              accentColor="purple"
              variant="linear"
            />
          ))}
        </div>
      </section>

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

export default FromHolmesGPT
