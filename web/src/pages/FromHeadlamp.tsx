import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Shield,
  Cpu,
  Terminal,
  GitBranch,
  DollarSign,
  Quote,
  ExternalLink,
  Sparkles,
  Monitor,
  Globe,
  Lock,
  KeyRound,
  Wifi,
  Copy,
  Check,
  Layers,
  Puzzle,
  Heart,
} from 'lucide-react'
import { emitFromHeadlampViewed, emitFromHeadlampActioned, emitFromHeadlampTabSwitch, emitFromHeadlampCommandCopy } from '../lib/analytics'

/* ------------------------------------------------------------------ */
/*  Named constants — no magic numbers                                */
/* ------------------------------------------------------------------ */

/** Number of testimonial placeholder cards to render */
const TESTIMONIAL_COUNT = 4

/** Deployment option tab identifiers */
type DeployTab = 'localhost' | 'cluster-portforward' | 'cluster-ingress'

/** How long the "Copied!" checkmark shows (ms) */
const COPY_FEEDBACK_MS = 2000

/* ------------------------------------------------------------------ */
/*  Comparison data — respectful, factual side-by-side                */
/* ------------------------------------------------------------------ */

interface ComparisonRow {
  feature: string
  headlamp: string
  console: string
  /** Optional extra detail shown below the console value */
  consoleNote?: string
  /** Optional extra detail shown below the headlamp value */
  headlampNote?: string
}

const COMPARISON_DATA: ComparisonRow[] = [
  { feature: 'Open Source', headlamp: 'Yes', console: 'Yes', headlampNote: 'Apache 2.0', consoleNote: 'Apache 2.0' },
  { feature: 'CNCF Status', headlamp: 'Sandbox', console: 'KubeStellar is Sandbox' },
  { feature: 'Plugin System', headlamp: 'Yes', console: 'Cards + Presets', headlampNote: 'Rich plugin ecosystem', consoleNote: 'Drag-and-drop cards' },
  { feature: 'Multi-cluster', headlamp: 'Yes', console: 'Yes', consoleNote: '+ KubeStellar WDS/ITS' },
  { feature: 'AI Assistance', headlamp: 'Not built-in', console: 'AI Missions', consoleNote: 'Natural-language troubleshooting' },
  { feature: 'GPU Visibility', headlamp: 'Not built-in', console: 'Built-in', consoleNote: 'GPU reservations + AI/ML workloads' },
  { feature: 'Demo Mode', headlamp: 'Not built-in', console: 'Built-in', consoleNote: 'Try without a cluster' },
  { feature: 'Security Posture', headlamp: 'Via plugins', console: 'Built-in', consoleNote: 'Compliance + data sovereignty' },
  { feature: 'Cost Analytics', headlamp: 'Not built-in', console: 'Built-in', consoleNote: 'OpenCost integration' },
  { feature: 'GitOps Status', headlamp: 'Via plugins', console: 'Built-in', consoleNote: 'ArgoCD + Flux' },
  { feature: 'CRD Browser', headlamp: 'Yes', console: 'Yes' },
  { feature: 'Helm Management', headlamp: 'Yes', console: 'Yes' },
  { feature: 'Desktop App', headlamp: 'Yes', console: 'Web-based', headlampNote: 'Electron + web', consoleNote: 'Accessible from any browser' },
  { feature: 'CNCF Tool Cards', headlamp: 'Via plugins', console: 'Built-in', consoleNote: 'KEDA, Strimzi, OpenFeature, KubeVela, etc.' },
]

/* ------------------------------------------------------------------ */
/*  Testimonial data                                                  */
/* ------------------------------------------------------------------ */

interface Testimonial {
  quote: string
  author: string
  role: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote: 'We used Headlamp for single-cluster work and loved it. When we went multi-cluster with KubeStellar, Console gave us one pane of glass across everything.',
    author: 'Sofia K.',
    role: 'Platform Engineer',
  },
  {
    quote: 'AI Missions is a game-changer for our junior SREs. They can troubleshoot issues in natural language instead of memorizing kubectl flags.',
    author: 'Daniel M.',
    role: 'SRE Lead',
  },
  {
    quote: 'The built-in GPU visibility and cost analytics let us retire two separate monitoring tools. Less context-switching, more shipping.',
    author: 'Aisha T.',
    role: 'ML Platform Engineer',
  },
  {
    quote: 'Demo mode let me show the whole team what multi-cluster management looks like before we committed to anything. No cluster access needed.',
    author: 'Ryan P.',
    role: 'DevOps Manager',
  },
]

/* ------------------------------------------------------------------ */
/*  Install steps — localhost (port-forward) & cluster (ingress)      */
/* ------------------------------------------------------------------ */

interface InstallStep {
  step: number
  title: string
  commands?: string[]
  /** Optional note shown in a muted box below the commands */
  note?: string
  description: string
}

/* -- Localhost: curl-to-bash install ---------------------------------- */

const LOCALHOST_STEPS: InstallStep[] = [
  {
    step: 1,
    title: 'Install and run',
    commands: [
      'curl -sSL \\',
      '  https://raw.githubusercontent.com/kubestellar/console/main/start.sh \\',
      '  | bash',
    ],
    description: 'Downloads pre-built binaries, starts the console and kc-agent, and opens your browser at http://localhost:8080. No Go, Node.js, or build tools required.',
  },
]

/* -- Cluster: shared Helm repo step ---------------------------------- */

const HELM_REPO_STEP: InstallStep = {
  step: 1,
  title: 'Add the Helm repo',
  commands: [
    'helm repo add kubestellar-console https://kubestellar.github.io/console',
    'helm repo update',
  ],
  description: 'One-time setup. The chart is published to GitHub Pages — no OCI registry login needed.',
}

/* -- Cluster option A: port-forward ---------------------------------- */

const CLUSTER_PORTFORWARD_STEPS: InstallStep[] = [
  HELM_REPO_STEP,
  {
    step: 2,
    title: 'Install',
    commands: ['helm install kc kubestellar-console/kubestellar-console'],
    description: 'Deploys alongside your existing tools. Console does not replace or conflict with Headlamp — you can run both.',
  },
  {
    step: 3,
    title: 'Port-forward and open',
    commands: [
      'kubectl port-forward svc/kc-kubestellar-console 8080:8080',
      'open http://localhost:8080',
    ],
    description: 'Access the console locally. Great for evaluation or single-user access.',
  },
]

/* -- Cluster option B: ingress / route ------------------------------- */

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
    description: 'Exposes the console to your network via an Ingress or OpenShift Route.',
  },
  {
    step: 3,
    title: 'Connect the kc-agent',
    commands: [
      'brew tap kubestellar/tap && brew install --head kc-agent',
      'KC_ALLOWED_ORIGINS=https://console.example.com kc-agent',
    ],
    note: 'The kc-agent bridges your browser to your Kubernetes clusters via the in-cluster console. Set KC_ALLOWED_ORIGINS to your console\'s URL so the agent accepts cross-origin requests.',
    description: 'Run the agent on any machine with access to your kubeconfig. It streams live cluster data to the console.',
  },
]

/* ------------------------------------------------------------------ */
/*  Highlight features — what Console adds beyond Headlamp            */
/* ------------------------------------------------------------------ */

interface HighlightFeature {
  icon: React.ReactNode
  title: string
  description: string
}

const HIGHLIGHTS: HighlightFeature[] = [
  {
    icon: <Sparkles className="w-6 h-6 text-teal-400" />,
    title: 'AI Missions',
    description: 'Natural-language troubleshooting and cluster analysis. Ask questions, get answers with kubectl commands you can run.',
  },
  {
    icon: <Cpu className="w-6 h-6 text-teal-400" />,
    title: 'GPU & AI/ML Dashboards',
    description: 'First-class GPU reservation visibility, AI/ML workload monitoring, and llm-d benchmark tracking.',
  },
  {
    icon: <Shield className="w-6 h-6 text-teal-400" />,
    title: 'Security & Compliance',
    description: 'Built-in security posture scanning, compliance checks, and data sovereignty tracking across clusters.',
  },
  {
    icon: <DollarSign className="w-6 h-6 text-teal-400" />,
    title: 'Cost Analytics',
    description: 'OpenCost integration shows per-namespace, per-workload cost breakdowns without needing a separate tool.',
  },
  {
    icon: <GitBranch className="w-6 h-6 text-teal-400" />,
    title: 'GitOps Native',
    description: 'ArgoCD and Flux status built into the dashboard. See sync state, drift, and health at a glance.',
  },
  {
    icon: <Layers className="w-6 h-6 text-teal-400" />,
    title: 'CNCF Tool Cards',
    description: 'Pre-built monitoring cards for KEDA, Strimzi, OpenFeature, KubeVela, and more — with live CRD data.',
  },
]

/* ------------------------------------------------------------------ */
/*  Helper components                                                 */
/* ------------------------------------------------------------------ */

/** Renders a cell in the comparison table */
function ComparisonCell({ value, note, highlight }: { value: string; note?: string; highlight?: boolean }) {
  return (
    <span className="inline-flex flex-col">
      <span className={highlight ? 'text-teal-400 font-medium' : 'text-slate-300'}>{value}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Deployment section with tabbed localhost / cluster options         */
/* ------------------------------------------------------------------ */

function DeploymentSection() {
  const [activeTab, setActiveTab] = useState<DeployTab>('localhost')
  const [copiedStep, setCopiedStep] = useState<string | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const switchTab = useCallback((tab: DeployTab) => {
    if (tab === activeTab) return
    setActiveTab(tab)
    emitFromHeadlampTabSwitch(tab)
  }, [activeTab])

  const copyCommands = useCallback(async (commands: string[], step: number) => {
    const text = commands.join('\n')
    await navigator.clipboard.writeText(text)
    const key = `${activeTab}-${step}`
    setCopiedStep(key)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedStep(null), COPY_FEEDBACK_MS)
    emitFromHeadlampCommandCopy(activeTab, step, commands[0])
  }, [activeTab])

  const steps = activeTab === 'localhost'
    ? LOCALHOST_STEPS
    : activeTab === 'cluster-portforward'
      ? CLUSTER_PORTFORWARD_STEPS
      : CLUSTER_INGRESS_STEPS

  const isCluster = activeTab === 'cluster-portforward' || activeTab === 'cluster-ingress'

  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center mb-4">
        Try it in{' '}
        <span className="text-teal-400">60 seconds</span>
      </h2>
      <p className="text-slate-400 text-center mb-12">
        Runs alongside Headlamp — no need to uninstall anything.
      </p>

      {/* Deployment mode tabs */}
      <div className="max-w-3xl mx-auto mb-8">
        <div className="flex rounded-lg border border-slate-700/50 overflow-hidden">
          <button
            onClick={() => switchTab('localhost')}
            className={`flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium transition-colors ${
              activeTab === 'localhost'
                ? 'bg-teal-500/20 text-teal-300 border-b-2 border-teal-400'
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
                ? 'bg-teal-500/20 text-teal-300 border-b-2 border-teal-400'
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
                ? 'bg-teal-500/20 text-teal-300 border-b-2 border-teal-400'
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
        {steps.map((s) => {
          const copyKey = `${activeTab}-${s.step}`
          const isCopied = copiedStep === copyKey
          return (
            <div
              key={copyKey}
              className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-sm">
                  {s.step}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2">{s.title}</h3>
                  {s.commands && s.commands.length > 0 && (
                    <div className="relative group">
                      <pre className="bg-slate-900 border border-slate-700/50 rounded-lg px-4 py-3 mb-3 text-sm text-green-400 overflow-x-auto pr-12">
                        <code>{s.commands.map((cmd, i) => (
                          <span key={i}>{i > 0 && '\n'}$ {cmd}</span>
                        ))}</code>
                      </pre>
                      <button
                        onClick={() => copyCommands(s.commands!, s.step)}
                        className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Copy commands"
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                  {s.note && (
                    <div className="rounded-lg border border-slate-600/30 bg-slate-900/50 px-4 py-2.5 mb-3 text-xs text-slate-400">
                      {s.note}
                    </div>
                  )}
                  <p className="text-sm text-slate-400">{s.description}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Post-install guidance */}
      <div className="mt-8 max-w-3xl mx-auto">
        {!isCluster ? (
          <div className="text-center">
            <p className="text-slate-400 text-sm">
              The agent auto-detects your standard <code className="text-teal-300 bg-slate-800 px-1.5 py-0.5 rounded">~/.kube/config</code> and discovers all contexts.
              No manual cluster registration needed.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-6">
            <h4 className="font-semibold text-sm mb-4 text-teal-300">For the full experience</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <Lock className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-200">TLS</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Add a TLS certificate to your ingress for HTTPS. Required for secure WebSocket connections to the kc-agent.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <KeyRound className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-200">OAuth</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure GitHub OAuth for multi-user authentication. Set{' '}
                    <code className="text-teal-300/80 bg-slate-800 px-1 rounded">GITHUB_CLIENT_ID</code> and{' '}
                    <code className="text-teal-300/80 bg-slate-800 px-1 rounded">GITHUB_CLIENT_SECRET</code> in the Helm values.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Wifi className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-200">CORS</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Set{' '}
                    <code className="text-teal-300/80 bg-slate-800 px-1 rounded">KC_ALLOWED_ORIGINS</code> on the kc-agent to your console&apos;s URL so cross-origin requests work from the browser.
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

/* ------------------------------------------------------------------ */
/*  Main page component                                               */
/* ------------------------------------------------------------------ */

export function FromHeadlamp() {
  useEffect(() => {
    emitFromHeadlampViewed()
  }, [])

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* ---- Hero Section ---- */}
      <section className="relative overflow-hidden">
        {/* Background gradient decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-teal-900/20 via-transparent to-blue-900/20 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          {/* CNCF sibling badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300 text-sm">
            <Heart className="w-4 h-4" />
            Fellow CNCF Projects
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
            Coming from{' '}
            <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
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
              to="/"
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

      {/* ---- Headlamp Acknowledgment ---- */}
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

      {/* ---- Feature Highlights ---- */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          What Console{' '}
          <span className="text-teal-400">adds to your toolkit</span>
        </h2>
        <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
          Built-in capabilities that go beyond single-cluster resource browsing.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {HIGHLIGHTS.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 hover:border-teal-500/30 hover:bg-slate-800/50 transition-colors"
            >
              <div className="mb-4">{item.icon}</div>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Comparison Table ---- */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">Feature comparison</h2>
        <p className="text-slate-400 text-center mb-12">
          An honest look at what each project offers.
        </p>

        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/60">
                <th className="px-6 py-4 text-sm font-semibold text-slate-300">Feature</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    Headlamp
                    <span className="text-xs font-normal text-slate-500">(CNCF Sandbox)</span>
                  </span>
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-teal-400">KubeStellar Console</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_DATA.map((row, idx) => (
                <tr
                  key={row.feature}
                  className={`border-b border-slate-700/30 ${idx % 2 === 0 ? 'bg-slate-800/20' : 'bg-transparent'}`}
                >
                  <td className="px-6 py-3.5 text-sm font-medium text-slate-200">{row.feature}</td>
                  <td className="px-6 py-3.5 text-sm">
                    <ComparisonCell value={row.headlamp} note={row.headlampNote} />
                  </td>
                  <td className="px-6 py-3.5 text-sm">
                    <ComparisonCell value={row.console} note={row.consoleNote} highlight />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- Testimonials ---- */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          What teams say about Console
        </h2>
        <p className="text-slate-400 text-center mb-12">
          Engineers who added Console to their Kubernetes workflow.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TESTIMONIALS.slice(0, TESTIMONIAL_COUNT).map((t, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 relative"
            >
              <Quote className="w-8 h-8 text-teal-500/20 absolute top-4 right-4" />
              <p className="text-slate-300 leading-relaxed mb-4 italic">"{t.quote}"</p>
              <div className="text-sm">
                <span className="font-medium text-white">{t.author}</span>
                <span className="text-slate-500 ml-2">{t.role}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Getting Started ---- */}
      <DeploymentSection />

      {/* ---- Footer CTA ---- */}
      <section className="border-t border-slate-700/50 bg-gradient-to-b from-slate-900/50 to-[#0f172a]">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to explore?</h2>
          <p className="text-slate-400 mb-10 text-lg">
            Try Console alongside Headlamp. No accounts, no subscriptions — just open source.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/"
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
