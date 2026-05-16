import { Cpu, DollarSign, GitBranch, Heart, Layers, Puzzle, Shield, Sparkles } from 'lucide-react'

import { emitFromHeadlampActioned, emitFromHeadlampCommandCopy, emitFromHeadlampTabSwitch, emitFromHeadlampViewed } from '../lib/analytics'
import { CompetitorLandingPage } from '../components/landing/CompetitorLandingPage'
import type { ComparisonRow } from '../components/landing/ComparisonTable'
import type { HighlightFeature } from '../components/landing/HighlightGrid'
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
  return (
    <CompetitorLandingPage
      accentColor="teal"
      competitorName="Headlamp"
      competitorSubtitle="(CNCF Sandbox)"
      analyticsSource="from_headlamp"
      heroBadgeIcon={<Heart className="w-4 h-4" />}
      heroBadgeText="Fellow CNCF Projects"
      heroLeadText="Headlamp is a great Kubernetes dashboard."
      heroLeadEmphasis="KubeStellar Console adds multi-cluster AI, GPU visibility, and built-in ops tools."
      heroSupportText="Both are open source, both are CNCF projects. Console complements Headlamp for teams that need cross-cluster observability and AI-powered troubleshooting."
      appreciationIcon={<Puzzle className="w-8 h-8 text-teal-400" />}
      appreciationTitle="Headlamp does a lot of things right"
      appreciationDescription="Headlamp's plugin architecture, clean UI, and Electron desktop app make it an excellent choice for many teams. If you're happy with Headlamp, keep using it! KubeStellar Console is designed for teams that need AI-powered troubleshooting, multi-cluster management at scale, GPU/AI-ML workload visibility, and built-in cost and security analytics — capabilities that complement what Headlamp provides."
      appreciationLinkHref="https://headlamp.dev"
      appreciationLinkLabel="Visit headlamp.dev"
      highlightTitle="What Console"
      highlightTitleAccent="adds to your toolkit"
      highlightSubtitle="Built-in capabilities that go beyond single-cluster resource browsing."
      highlights={HIGHLIGHTS}
      comparisonTitle="Feature comparison"
      comparisonSubtitle="An honest look at what each project offers."
      comparisonRows={COMPARISON_DATA}
      deployTitle="Try it in"
      deploySubtitle="Runs alongside Headlamp — no need to uninstall anything."
      localhostSteps={LOCALHOST_STEPS}
      portForwardSteps={CLUSTER_PORTFORWARD_STEPS}
      ingressSteps={CLUSTER_INGRESS_STEPS}
      footerDescription="Try Console alongside Headlamp. No accounts, no subscriptions — just open source."
      onViewed={emitFromHeadlampViewed}
      onActioned={emitFromHeadlampActioned}
      onTabSwitch={emitFromHeadlampTabSwitch}
      onCommandCopy={emitFromHeadlampCommandCopy}
    />
  )
}

export default FromHeadlamp
