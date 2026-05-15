import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Cpu, DollarSign, ExternalLink, GitBranch, Heart, Layers, Puzzle, Shield, Sparkles } from 'lucide-react'

import { emitFromHeadlampActioned, emitFromHeadlampCommandCopy, emitFromHeadlampTabSwitch, emitFromHeadlampViewed } from '../lib/analytics'
import { ROUTES } from '../config/routes'
import { ComparisonTable, type ComparisonRow } from '../components/landing/ComparisonTable'
import { HighlightGrid, type HighlightFeature } from '../components/landing/HighlightGrid'
import { TabbedDeploySection } from '../components/landing/TabbedDeploySection'
import type { InstallStep } from '../components/landing/InstallStepCard'

const COMPARISON_DATA: ComparisonRow[] = [
  { feature: 'Open Source', competitor: 'Yes', console: 'Yes', competitorNote: 'Apache 2.0', consoleNote: 'Apache 2.0' },
  { feature: 'CNCF Status', competitor: 'Sandbox', console: 'KubeStellar Console is Sandbox' },
  { feature: 'Plugin System', competitor: 'Yes', console: 'Cards + Presets', competitorNote: 'Rich plugin ecosystem', consoleNote: 'Drag-and-drop cards' },
  { feature: 'Multi-cluster', competitor: 'Yes', console: 'Yes', consoleNote: '+ KubeStellar WDS/ITS' },
  { feature: 'AI Assistance', competitor: 'Not built-in', console: 'AI Missions', consoleNote: 'Natural-language troubleshooting' },
  { feature: 'GPU Visibility', competitor: 'Not built-in', console: 'Built-in', consoleNote: 'GPU reservations + AI/ML workloads' },
  { feature: 'Demo Mode', competitor: 'Not built-in', console: 'Built-in', consoleNote: 'Try without a cluster' },
  { feature: 'Security Posture', competitor: 'Via plugins', console: 'Built-in', consoleNote: 'Compliance + data sovereignty' },
  { feature: 'Cost Analytics', competitor: 'Not built-in', console: 'Built-in', consoleNote: 'OpenCost integration' },
  { feature: 'GitOps Status', competitor: 'Via plugins', console: 'Built-in', consoleNote: 'ArgoCD + Flux' },
  { feature: 'CRD Browser', competitor: 'Yes', console: 'Yes' },
  { feature: 'Helm Management', competitor: 'Yes', console: 'Yes' },
  { feature: 'Desktop App', competitor: 'Yes', console: 'Web-based', competitorNote: 'Electron + web', consoleNote: 'Accessible from any browser' },
  { feature: 'CNCF Tool Cards', competitor: 'Via plugins', console: 'Built-in', consoleNote: 'KEDA, Strimzi, OpenFeature, KubeVela, etc.' },
]

const HIGHLIGHTS: HighlightFeature[] = [
  {
    icon: <Sparkles className="w-6 h-6 text-teal-400" />,
    title: 'AI Missions',
    description: 'Natural-language troubleshooting and cluster analysis. Ask questions, get answers with kubectl commands you can run.' },
  {
    icon: <Cpu className="w-6 h-6 text-teal-400" />,
    title: 'GPU & AI/ML Dashboards',
    description: 'First-class GPU reservation visibility, AI/ML workload monitoring, and llm-d benchmark tracking.' },
  {
    icon: <Shield className="w-6 h-6 text-teal-400" />,
    title: 'Security & Compliance',
    description: 'Built-in security posture scanning, compliance checks, and data sovereignty tracking across clusters.' },
  {
    icon: <DollarSign className="w-6 h-6 text-teal-400" />,
    title: 'Cost Analytics',
    description: 'OpenCost integration shows per-namespace, per-workload cost breakdowns without needing a separate tool.' },
  {
    icon: <GitBranch className="w-6 h-6 text-teal-400" />,
    title: 'GitOps Native',
    description: 'ArgoCD and Flux status built into the dashboard. See sync state, drift, and health at a glance.' },
  {
    icon: <Layers className="w-6 h-6 text-teal-400" />,
    title: 'CNCF Tool Cards',
    description: 'Pre-built monitoring cards for KEDA, Strimzi, OpenFeature, KubeVela, and more — with live CRD data.' },
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
    description: 'Deploys alongside your existing tools. Console does not replace or conflict with Headlamp — you can run both.' },
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

export function FromHeadlamp() {
  useEffect(() => {
    emitFromHeadlampViewed()
  }, [])

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-teal-900/20 via-transparent to-blue-900/20 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300 text-sm">
            <Heart className="w-4 h-4" />
            Fellow CNCF Projects
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
            Coming from{' '}
            <span className="bg-linear-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
              Headlamp?
            </span>
          </h1>

          <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-6 leading-relaxed">
            Headlamp is a great Kubernetes dashboard.{' '}
            <span className="text-white font-medium">KubeStellar Console adds multi-cluster AI, GPU visibility, and built-in ops tools.</span>
          </p>

          <p className="text-sm text-slate-400 max-w-xl mx-auto mb-10">
            Both are open source, both are CNCF projects. Console complements Headlamp for teams that need cross-cluster observability and AI-powered troubleshooting.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to={ROUTES.HOME}
              onClick={() => emitFromHeadlampActioned('hero_try_demo')}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-teal-500 hover:bg-teal-600 text-white font-semibold text-lg transition-colors"
            >
              Try Demo Mode
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => emitFromHeadlampActioned('hero_view_github')}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg border border-slate-600 hover:border-slate-500 hover:bg-slate-800/50 text-slate-300 font-medium text-lg transition-colors"
            >
              View on GitHub
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-8 text-center">
          <Puzzle className="w-8 h-8 text-teal-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-3">Headlamp does a lot of things right</h3>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm leading-relaxed">
            Headlamp's plugin architecture, clean UI, and Electron desktop app make it an excellent choice for many teams.
            If you're happy with Headlamp, keep using it! KubeStellar Console is designed for teams that need
            AI-powered troubleshooting, multi-cluster management at scale, GPU/AI-ML workload visibility, and
            built-in cost and security analytics — capabilities that complement what Headlamp provides.
          </p>
          <a
            href="https://headlamp.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-4 text-sm text-teal-400 hover:text-teal-300 transition-colors"
          >
            Visit headlamp.dev
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>

      <HighlightGrid
        title="What Console"
        titleAccent="adds to your toolkit"
        subtitle="Built-in capabilities that go beyond single-cluster resource browsing."
        highlights={HIGHLIGHTS}
        accentColor="teal"
      />

      <ComparisonTable
        title="Feature comparison"
        subtitle="An honest look at what each project offers."
        rows={COMPARISON_DATA}
        competitorName="Headlamp"
        competitorSubtitle="(CNCF Sandbox)"
        accentColor="teal"
      />

      <TabbedDeploySection
        accentColor="teal"
        title="Try it in"
        subtitle="Runs alongside Headlamp — no need to uninstall anything."
        localhostSteps={LOCALHOST_STEPS}
        portForwardSteps={CLUSTER_PORTFORWARD_STEPS}
        ingressSteps={CLUSTER_INGRESS_STEPS}
        analyticsSource="from_headlamp"
        onTabSwitch={emitFromHeadlampTabSwitch}
        onCommandCopy={emitFromHeadlampCommandCopy}
      />

      <section className="border-t border-slate-700/50 bg-linear-to-b from-slate-900/50 to-[#0f172a]">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to explore?</h2>
          <p className="text-slate-400 mb-10 text-lg">
            Try Console alongside Headlamp. No accounts, no subscriptions — just open source.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to={ROUTES.HOME}
              onClick={() => emitFromHeadlampActioned('footer_try_demo')}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-teal-500 hover:bg-teal-600 text-white font-semibold text-lg transition-colors"
            >
              Try Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => emitFromHeadlampActioned('footer_view_github')}
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

export default FromHeadlamp
