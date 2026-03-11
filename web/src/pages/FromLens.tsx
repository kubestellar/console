import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Shield,
  Cpu,
  Terminal,
  GitBranch,
  DollarSign,
  Quote,
  ExternalLink,
  Sparkles,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Named constants — no magic numbers                                */
/* ------------------------------------------------------------------ */

/** Number of testimonial placeholder cards to render */
const TESTIMONIAL_COUNT = 4

/** Number of install steps to display */
const INSTALL_STEP_COUNT = 3

/* ------------------------------------------------------------------ */
/*  Comparison table data                                             */
/* ------------------------------------------------------------------ */

interface ComparisonRow {
  feature: string
  lens: string | boolean
  console: string | boolean
  /** Optional extra detail shown below the console value */
  consoleNote?: string
}

const COMPARISON_DATA: ComparisonRow[] = [
  { feature: 'Open Source', lens: false, console: true, consoleNote: 'Apache 2.0' },
  { feature: 'Account Required', lens: true, console: false },
  { feature: 'Price', lens: '$199/year', console: 'Free' },
  { feature: 'Multi-cluster', lens: true, console: true, consoleNote: '+ KubeStellar native' },
  { feature: 'AI Assistance', lens: false, console: true, consoleNote: 'AI Missions' },
  { feature: 'GPU Visibility', lens: false, console: true },
  { feature: 'Demo Mode', lens: false, console: true, consoleNote: 'Try without a cluster' },
  { feature: 'Telemetry', lens: 'Required', console: 'Optional', consoleNote: 'Umami, self-hosted' },
  { feature: 'Pod Logs', lens: true, console: true },
  { feature: 'Helm Management', lens: true, console: true },
  { feature: 'CRD Browser', lens: true, console: true },
  { feature: 'Security Posture', lens: false, console: true, consoleNote: 'Built-in' },
  { feature: 'Cost Analytics', lens: false, console: true, consoleNote: 'Built-in (OpenCost)' },
  { feature: 'GitOps Status', lens: false, console: true, consoleNote: 'Built-in (ArgoCD/Flux)' },
]

/* ------------------------------------------------------------------ */
/*  Testimonial placeholder data                                      */
/* ------------------------------------------------------------------ */

interface Testimonial {
  quote: string
  author: string
  role: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote: 'After Lens went closed-source, KubeStellar Console was exactly what we needed. The multi-cluster view is leagues ahead.',
    author: 'Placeholder Name',
    role: 'Platform Engineer',
  },
  {
    quote: 'AI Missions changed how our team troubleshoots. It is like having a senior SRE on call 24/7.',
    author: 'Placeholder Name',
    role: 'SRE Lead',
  },
  {
    quote: 'GPU visibility and cost analytics out of the box? We dropped three separate tools for one Console.',
    author: 'Placeholder Name',
    role: 'ML Infrastructure Engineer',
  },
  {
    quote: 'Demo mode let me evaluate Console without touching production. I was sold in five minutes.',
    author: 'Placeholder Name',
    role: 'DevOps Manager',
  },
]

/* ------------------------------------------------------------------ */
/*  Install steps                                                     */
/* ------------------------------------------------------------------ */

interface InstallStep {
  step: number
  title: string
  command?: string
  description: string
}

const INSTALL_STEPS: InstallStep[] = [
  {
    step: 1,
    title: 'Install with Helm',
    command: 'helm install kc oci://ghcr.io/kubestellar/console/chart',
    description: 'One command. No accounts, no license keys, no telemetry opt-in dialogs.',
  },
  {
    step: 2,
    title: 'Port-forward or expose',
    command: 'kubectl port-forward svc/kubestellar-console 8080:8080',
    description: 'Console auto-detects your kubeconfig and discovers clusters immediately.',
  },
  {
    step: 3,
    title: 'Open your browser',
    command: 'open http://localhost:8080',
    description: 'That is it. Your clusters, pods, and deployments are waiting for you.',
  },
]

/* ------------------------------------------------------------------ */
/*  Highlight features                                                */
/* ------------------------------------------------------------------ */

interface HighlightFeature {
  icon: React.ReactNode
  title: string
  description: string
}

const HIGHLIGHTS: HighlightFeature[] = [
  {
    icon: <Sparkles className="w-6 h-6 text-purple-400" />,
    title: 'AI Missions',
    description: 'Natural-language troubleshooting and cluster analysis. Ask questions, get answers with kubectl commands you can run.',
  },
  {
    icon: <Cpu className="w-6 h-6 text-purple-400" />,
    title: 'GPU & AI/ML Dashboards',
    description: 'First-class GPU reservation visibility, AI/ML workload monitoring, and llm-d benchmark tracking.',
  },
  {
    icon: <Shield className="w-6 h-6 text-purple-400" />,
    title: 'Security Posture',
    description: 'Built-in security scanning, compliance checks, and data sovereignty tracking across all clusters.',
  },
  {
    icon: <DollarSign className="w-6 h-6 text-purple-400" />,
    title: 'Cost Analytics',
    description: 'OpenCost integration shows per-namespace, per-workload cost breakdowns. No separate billing tool needed.',
  },
  {
    icon: <GitBranch className="w-6 h-6 text-purple-400" />,
    title: 'GitOps Native',
    description: 'ArgoCD and Flux status baked into the dashboard. See sync state, drift, and health at a glance.',
  },
  {
    icon: <Terminal className="w-6 h-6 text-purple-400" />,
    title: 'Demo Mode',
    description: 'Try every feature without connecting a cluster. Perfect for evaluation, demos, and learning the interface.',
  },
]

/* ------------------------------------------------------------------ */
/*  Helper components                                                 */
/* ------------------------------------------------------------------ */

/** Renders a boolean or string cell in the comparison table */
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
      <span className={isConsole ? 'text-green-400 font-medium' : 'text-red-400/80'}>{value}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page component                                               */
/* ------------------------------------------------------------------ */

export function FromLens() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* ---- Hero Section ---- */}
      <section className="relative overflow-hidden">
        {/* Background gradient decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-blue-900/20 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          {/* Small badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-sm">
            <Sparkles className="w-4 h-4" />
            Open Source Kubernetes Console
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
            Switching from{' '}
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Lens?
            </span>
          </h1>

          <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            KubeStellar Console is the open-source, AI-powered alternative.{' '}
            <span className="text-white font-medium">No account required. No subscription. No telemetry.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold text-lg transition-colors"
            >
              Try Demo Mode
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg border border-slate-600 hover:border-slate-500 hover:bg-slate-800/50 text-slate-300 font-medium text-lg transition-colors"
            >
              View on GitHub
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ---- Feature Highlights ---- */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          Everything Lens had.{' '}
          <span className="text-purple-400">Plus everything it didn't.</span>
        </h2>
        <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
          KubeStellar Console goes beyond basic cluster management with AI, security, cost, and GitOps built in.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {HIGHLIGHTS.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 hover:border-purple-500/30 hover:bg-slate-800/50 transition-colors"
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
        <h2 className="text-3xl font-bold text-center mb-4">Side-by-side comparison</h2>
        <p className="text-slate-400 text-center mb-12">
          See how KubeStellar Console stacks up against Lens Pro.
        </p>

        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/60">
                <th className="px-6 py-4 text-sm font-semibold text-slate-300">Feature</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-400">Lens Pro</th>
                <th className="px-6 py-4 text-sm font-semibold text-purple-400">KubeStellar Console</th>
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
                    <ComparisonCell value={row.lens} />
                  </td>
                  <td className="px-6 py-3.5 text-sm">
                    <ComparisonCell value={row.console} note={row.consoleNote} isConsole />
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
          What Lens users love about Console
        </h2>
        <p className="text-slate-400 text-center mb-12">
          Engineers who made the switch aren't looking back.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TESTIMONIALS.slice(0, TESTIMONIAL_COUNT).map((t, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 relative"
            >
              <Quote className="w-8 h-8 text-purple-500/20 absolute top-4 right-4" />
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
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          Getting started in{' '}
          <span className="text-purple-400">60 seconds</span>
        </h2>
        <p className="text-slate-400 text-center mb-12">
          No sign-up, no license file, no phone-home. Just Helm and a kubeconfig.
        </p>

        <div className="space-y-6 max-w-3xl mx-auto">
          {INSTALL_STEPS.slice(0, INSTALL_STEP_COUNT).map((s) => (
            <div
              key={s.step}
              className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm">
                  {s.step}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2">{s.title}</h3>
                  {s.command && (
                    <pre className="bg-slate-900 border border-slate-700/50 rounded-lg px-4 py-3 mb-3 text-sm text-green-400 overflow-x-auto">
                      <code>$ {s.command}</code>
                    </pre>
                  )}
                  <p className="text-sm text-slate-400">{s.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-slate-400 text-sm">
            Console auto-detects your standard <code className="text-purple-300 bg-slate-800 px-1.5 py-0.5 rounded">~/.kube/config</code> and discovers all contexts.
            No manual cluster registration needed.
          </p>
        </div>
      </section>

      {/* ---- Footer CTA ---- */}
      <section className="border-t border-slate-700/50 bg-gradient-to-b from-slate-900/50 to-[#0f172a]">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to switch?</h2>
          <p className="text-slate-400 mb-10 text-lg">
            Join the growing community of engineers who chose open source over lock-in.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold text-lg transition-colors"
            >
              Try Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
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
