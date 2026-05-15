import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Cpu, DollarSign, ExternalLink, GitBranch, Monitor, Shield, Sparkles, Terminal } from 'lucide-react'

import { emitFromLensActioned, emitFromLensCommandCopy, emitFromLensTabSwitch, emitFromLensViewed } from '../lib/analytics'
import { ROUTES } from '../config/routes'
import { ComparisonTable, type ComparisonRow } from '../components/landing/ComparisonTable'
import { HighlightGrid, type HighlightFeature } from '../components/landing/HighlightGrid'
import { TabbedDeploySection } from '../components/landing/TabbedDeploySection'
import type { InstallStep } from '../components/landing/InstallStepCard'

const COMPARISON_DATA: ComparisonRow[] = [
  { feature: 'Open Source', competitor: 'Freemium', console: true, consoleNote: 'Apache 2.0' },
  { feature: 'Account Required', competitor: 'For Pro features', console: false },
  { feature: 'Multi-cluster', competitor: true, console: true, consoleNote: '+ KubeStellar native' },
  { feature: 'AI Assistance', competitor: 'Lens AI (Pro)', console: true, consoleNote: 'AI Missions (free)' },
  { feature: 'GPU Visibility', competitor: false, console: true, consoleNote: 'Built-in' },
  { feature: 'Demo Mode', competitor: false, console: true, consoleNote: 'Try without a cluster' },
  { feature: 'Desktop App', competitor: true, console: 'Web-based', consoleNote: 'Any browser' },
  { feature: 'Pod Logs', competitor: true, console: true },
  { feature: 'Helm Management', competitor: true, console: true },
  { feature: 'CRD Browser', competitor: true, console: true },
  { feature: 'Security Posture', competitor: 'Via extensions', console: true, consoleNote: 'Built-in' },
  { feature: 'Cost Analytics', competitor: false, console: true, consoleNote: 'Built-in (OpenCost)' },
  { feature: 'GitOps Status', competitor: false, console: true, consoleNote: 'Built-in (ArgoCD/Flux)' },
  { feature: 'CNCF Tool Cards', competitor: false, console: true, consoleNote: 'KEDA, Strimzi, KubeVela, etc.' },
]

const HIGHLIGHTS: HighlightFeature[] = [
  {
    icon: <Sparkles className="w-6 h-6 text-purple-400" />,
    title: 'AI Missions',
    description: 'Natural-language troubleshooting and cluster analysis. Ask questions, get answers with kubectl commands you can run.' },
  {
    icon: <Cpu className="w-6 h-6 text-purple-400" />,
    title: 'GPU & AI/ML Dashboards',
    description: 'First-class GPU reservation visibility, AI/ML workload monitoring, and llm-d benchmark tracking.' },
  {
    icon: <Shield className="w-6 h-6 text-purple-400" />,
    title: 'Security Posture',
    description: 'Built-in security scanning, compliance checks, and data sovereignty tracking across all clusters.' },
  {
    icon: <DollarSign className="w-6 h-6 text-purple-400" />,
    title: 'Cost Analytics',
    description: 'OpenCost integration shows per-namespace, per-workload cost breakdowns. No separate billing tool needed.' },
  {
    icon: <GitBranch className="w-6 h-6 text-purple-400" />,
    title: 'GitOps Native',
    description: 'ArgoCD and Flux status baked into the dashboard. See sync state, drift, and health at a glance.' },
  {
    icon: <Terminal className="w-6 h-6 text-purple-400" />,
    title: 'Demo Mode',
    description: 'Try every feature without connecting a cluster. Perfect for evaluation, demos, and learning the interface.' },
]

const LOCALHOST_STEPS: InstallStep[] = [
  {
    step: 1,
    title: 'Install and run',
    commands: [
      'curl -sSL \\',
      '  https://raw.githubusercontent.com/kubestellar/console/main/start.sh \\',
      '  | bash',
    ],
    description: 'Downloads pre-built binaries, starts the console and kc-agent, and opens your browser at http://localhost:8080. No Go, Node.js, or build tools required.' },
]

const HELM_REPO_STEP: InstallStep = {
  step: 1,
  title: 'Add the Helm repo',
  commands: [
    'helm repo add kubestellar-console https://kubestellar.github.io/console',
    'helm repo update',
  ],
  description: 'One-time setup. The chart is published to GitHub Pages — no OCI registry login needed.' }

const CLUSTER_PORTFORWARD_STEPS: InstallStep[] = [
  HELM_REPO_STEP,
  {
    step: 2,
    title: 'Install',
    commands: ['helm install kc kubestellar-console/kubestellar-console'],
    description: 'No accounts, no license keys, no telemetry opt-in dialogs.' },
  {
    step: 3,
    title: 'Port-forward and open',
    commands: [
      'kubectl port-forward svc/kc-kubestellar-console 8080:8080',
      '# Then open http://localhost:8080 in your browser',
    ],
    description: 'Access the console locally. Great for evaluation or single-user access.' },
]

const CLUSTER_INGRESS_STEPS: InstallStep[] = [
  HELM_REPO_STEP,
  {
    step: 2,
    title: 'Install with ingress',
    commands: [
      'helm install kc kubestellar-console/kubestellar-console \\',
      '  --set ingress.enabled=true \\',
      '  --set ingress.className=nginx \\',
      '  --set ingress.hosts[0].host=console.example.com \\',
      '  --set ingress.hosts[0].paths[0].path=/ \\',
      '  --set ingress.hosts[0].paths[0].pathType=Prefix',
    ],
    note: 'Replace console.example.com with your domain. For OpenShift, use --set route.enabled=true --set route.host=console.example.com instead.',
    description: 'Exposes the console to your network via an Ingress or OpenShift Route.' },
  {
    step: 3,
    title: 'Connect the kc-agent',
    commands: [
      'brew tap kubestellar/tap && brew install kc-agent',
      "KC_ALLOWED_ORIGINS=https://console.example.com kc-agent",
    ],
    note: "The kc-agent bridges your browser to your Kubernetes clusters via the in-cluster console. Set KC_ALLOWED_ORIGINS to your console's URL so the agent accepts cross-origin requests.",
    description: 'Run the agent on any machine with access to your kubeconfig. It streams live cluster data to the console.' },
]

export function FromLens() {
  useEffect(() => {
    emitFromLensViewed()
  }, [])

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-purple-900/20 via-transparent to-blue-900/20 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-sm">
            <Sparkles className="w-4 h-4" />
            Open Source Kubernetes Console
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
            Coming from{' '}
            <span className="bg-linear-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Lens?
            </span>
          </h1>

          <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-6 leading-relaxed">
            Lens is a solid Kubernetes IDE.{' '}
            <span className="text-white font-medium">KubeStellar Console adds multi-cluster AI, GPU visibility, and built-in ops tools.</span>
          </p>

          <p className="text-sm text-slate-400 max-w-xl mx-auto mb-10">
            Both tools work well for Kubernetes management. Console is fully open source and focused on teams that need cross-cluster observability and AI-powered troubleshooting.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to={ROUTES.HOME}
              onClick={() => emitFromLensActioned('hero_try_demo')}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold text-lg transition-colors"
            >
              Try Demo Mode
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => emitFromLensActioned('hero_view_github')}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg border border-slate-600 hover:border-slate-500 hover:bg-slate-800/50 text-slate-300 font-medium text-lg transition-colors"
            >
              View on GitHub
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-8 text-center">
          <Monitor className="w-8 h-8 text-purple-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-3">Lens does a lot of things right</h3>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm leading-relaxed">
            Lens pioneered the desktop Kubernetes IDE experience with its Electron app, rich extension ecosystem, and clean resource browser.
            If Lens works well for your team, keep using it! KubeStellar Console is designed for teams that need
            AI-powered troubleshooting, multi-cluster management at scale, GPU/AI-ML workload visibility, and
            built-in cost and security analytics — capabilities that complement what Lens provides.
          </p>
          <a
            href="https://k8slens.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-4 text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            Visit k8slens.dev
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>

      <HighlightGrid
        title="What Console"
        titleAccent="adds to your toolkit"
        subtitle="Built-in capabilities that go beyond single-cluster resource browsing."
        highlights={HIGHLIGHTS}
        accentColor="purple"
      />

      <ComparisonTable
        title="Side-by-side comparison"
        subtitle="How the two tools compare across common workflows."
        rows={COMPARISON_DATA}
        competitorName="Lens"
        accentColor="purple"
      />

      <TabbedDeploySection
        accentColor="purple"
        title="Getting started in"
        subtitle="No sign-up, no license file. Just Helm and a kubeconfig."
        localhostSteps={LOCALHOST_STEPS}
        portForwardSteps={CLUSTER_PORTFORWARD_STEPS}
        ingressSteps={CLUSTER_INGRESS_STEPS}
        analyticsSource="from_lens"
        onTabSwitch={emitFromLensTabSwitch}
        onCommandCopy={emitFromLensCommandCopy}
      />

      <section className="border-t border-slate-700/50 bg-linear-to-b from-slate-900/50 to-[#0f172a]">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to explore?</h2>
          <p className="text-slate-400 mb-10 text-lg">
            Try Console alongside Lens. No accounts, no subscriptions — just open source.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to={ROUTES.HOME}
              onClick={() => emitFromLensActioned('footer_try_demo')}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold text-lg transition-colors"
            >
              Try Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => emitFromLensActioned('footer_view_github')}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg border border-slate-600 hover:border-slate-500 hover:bg-slate-800/50 text-slate-300 font-medium text-lg transition-colors"
            >
              View on GitHub
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}

export default FromLens
