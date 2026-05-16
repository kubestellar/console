import { Cpu, DollarSign, GitBranch, Monitor, Shield, Sparkles, Terminal } from 'lucide-react'

import { emitFromLensActioned, emitFromLensCommandCopy, emitFromLensTabSwitch, emitFromLensViewed } from '../lib/analytics'
import { CompetitorLandingPage } from '../components/landing/CompetitorLandingPage'
import type { ComparisonRow } from '../components/landing/ComparisonTable'
import type { HighlightFeature } from '../components/landing/HighlightGrid'
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
  return (
    <CompetitorLandingPage
      accentColor="purple"
      competitorName="Lens"
      analyticsSource="from_lens"
      heroBadgeIcon={<Sparkles className="w-4 h-4" />}
      heroBadgeText="Open Source Kubernetes Console"
      heroLeadText="Lens is a solid Kubernetes IDE."
      heroLeadEmphasis="KubeStellar Console adds multi-cluster AI, GPU visibility, and built-in ops tools."
      heroSupportText="Both tools work well for Kubernetes management. Console is fully open source and focused on teams that need cross-cluster observability and AI-powered troubleshooting."
      appreciationIcon={<Monitor className="w-8 h-8 text-purple-400" />}
      appreciationTitle="Lens does a lot of things right"
      appreciationDescription="Lens pioneered the desktop Kubernetes IDE experience with its Electron app, rich extension ecosystem, and clean resource browser. If Lens works well for your team, keep using it! KubeStellar Console is designed for teams that need AI-powered troubleshooting, multi-cluster management at scale, GPU/AI-ML workload visibility, and built-in cost and security analytics — capabilities that complement what Lens provides."
      appreciationLinkHref="https://k8slens.dev"
      appreciationLinkLabel="Visit k8slens.dev"
      highlightTitle="What Console"
      highlightTitleAccent="adds to your toolkit"
      highlightSubtitle="Built-in capabilities that go beyond single-cluster resource browsing."
      highlights={HIGHLIGHTS}
      comparisonTitle="Side-by-side comparison"
      comparisonSubtitle="How the two tools compare across common workflows."
      comparisonRows={COMPARISON_DATA}
      deployTitle="Getting started in"
      deploySubtitle="No sign-up, no license file. Just Helm and a kubeconfig."
      localhostSteps={LOCALHOST_STEPS}
      portForwardSteps={CLUSTER_PORTFORWARD_STEPS}
      ingressSteps={CLUSTER_INGRESS_STEPS}
      footerDescription="Try Console alongside Lens. No accounts, no subscriptions — just open source."
      onViewed={emitFromLensViewed}
      onActioned={emitFromLensActioned}
      onTabSwitch={emitFromLensTabSwitch}
      onCommandCopy={emitFromLensCommandCopy}
    />
  )
}

export default FromLens
