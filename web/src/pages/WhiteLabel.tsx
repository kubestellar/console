import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ExternalLink,
  Sparkles,
  Palette,
  Layers,
  BarChart3,
  Terminal,
  Globe,
  Copy,
  Check,
  Shield,
  Eye,
  EyeOff,
  Settings,
  Package,
  Puzzle,
} from 'lucide-react'
import { emitWhiteLabelViewed, emitWhiteLabelActioned, emitWhiteLabelTabSwitch, emitWhiteLabelCommandCopy, emitInstallCommandCopied } from '../lib/analytics'
import { copyToClipboard } from '../lib/clipboard'

/* ------------------------------------------------------------------ */
/*  Named constants — no magic numbers                                */
/* ------------------------------------------------------------------ */

/** Deployment option tab identifiers */
type DeployTab = 'binary' | 'helm' | 'docker'

/** How long the "Copied!" checkmark shows (ms) */
const COPY_FEEDBACK_MS = 2000

/* ------------------------------------------------------------------ */
/*  What You Get — feature highlights for white-label                 */
/* ------------------------------------------------------------------ */

interface HighlightFeature {
  icon: React.ReactNode
  title: string
  description: string
}

const HIGHLIGHTS: HighlightFeature[] = [
  {
    icon: <Palette className="w-6 h-6 text-purple-400" />,
    title: 'Full Branding Control',
    description: 'App name, logo, favicon, theme color, tagline — all configurable via env vars at runtime. No rebuilding required.',
  },
  {
    icon: <Layers className="w-6 h-6 text-purple-400" />,
    title: 'Project-Scoped Features',
    description: 'Set CONSOLE_PROJECT to your project ID and only generic K8s dashboards + your project-specific cards appear. KubeStellar features disappear.',
  },
  {
    icon: <Puzzle className="w-6 h-6 text-purple-400" />,
    title: '150+ Cards, 30 Dashboards',
    description: 'Pods, Deployments, Services, Nodes, GPU, Storage, Network, Security, Cost, GitOps, Helm, Operators — all out of the box.',
  },
  {
    icon: <Sparkles className="w-6 h-6 text-purple-400" />,
    title: 'AI Missions',
    description: 'Natural-language cluster troubleshooting powered by Claude. Your users ask questions, get kubectl commands they can run.',
  },
  {
    icon: <BarChart3 className="w-6 h-6 text-purple-400" />,
    title: 'Your Own Analytics',
    description: 'Provide your own GA4 and Umami IDs, or leave them empty to disable telemetry entirely. Zero tracking by default.',
  },
  {
    icon: <Shield className="w-6 h-6 text-purple-400" />,
    title: 'Production-Ready',
    description: 'Helm chart with PVC persistence, RBAC, network policies, pod disruption budgets, and OpenShift Route support.',
  },
]

/* ------------------------------------------------------------------ */
/*  What's Included vs Hidden                                         */
/* ------------------------------------------------------------------ */

interface VisibilityRow {
  feature: string
  universal: boolean
  kubeStellarOnly: boolean
}

const VISIBILITY_DATA: VisibilityRow[] = [
  { feature: 'Pods, Deployments, Services, Nodes', universal: true, kubeStellarOnly: false },
  { feature: 'GPU Monitoring & Reservations', universal: true, kubeStellarOnly: false },
  { feature: 'Security Posture & Compliance', universal: true, kubeStellarOnly: false },
  { feature: 'Cost Analytics (OpenCost)', universal: true, kubeStellarOnly: false },
  { feature: 'GitOps (ArgoCD / Flux)', universal: true, kubeStellarOnly: false },
  { feature: 'Helm Management', universal: true, kubeStellarOnly: false },
  { feature: 'AI Missions (Claude)', universal: true, kubeStellarOnly: false },
  { feature: 'Operator Management', universal: true, kubeStellarOnly: false },
  { feature: 'Log Viewer', universal: true, kubeStellarOnly: false },
  { feature: 'Network & Storage Dashboards', universal: true, kubeStellarOnly: false },
  { feature: 'Benchmark Cards (llm-d)', universal: false, kubeStellarOnly: true },
  { feature: 'Deploy Missions & Cluster Groups', universal: false, kubeStellarOnly: true },
  { feature: 'Nightly E2E Status', universal: false, kubeStellarOnly: true },
  { feature: 'Kagenti Agent Cards', universal: false, kubeStellarOnly: true },
]

/* ------------------------------------------------------------------ */
/*  Branding env var reference                                        */
/* ------------------------------------------------------------------ */

interface BrandingVar {
  envVar: string
  helmKey: string
  defaultValue: string
  description: string
}

const BRANDING_VARS: BrandingVar[] = [
  { envVar: 'APP_NAME', helmKey: 'branding.appName', defaultValue: 'KubeStellar Console', description: 'Full app name shown in navbar & title' },
  { envVar: 'APP_SHORT_NAME', helmKey: 'branding.appShortName', defaultValue: 'KubeStellar', description: 'Compact name for sidebar & mobile' },
  { envVar: 'APP_TAGLINE', helmKey: 'branding.tagline', defaultValue: 'multi-cluster first...', description: 'Tagline below the app name' },
  { envVar: 'LOGO_URL', helmKey: 'branding.logoUrl', defaultValue: '/kubestellar-logo.svg', description: 'Logo image path or URL' },
  { envVar: 'FAVICON_URL', helmKey: 'branding.faviconUrl', defaultValue: '/favicon.ico', description: 'Browser tab favicon' },
  { envVar: 'THEME_COLOR', helmKey: 'branding.themeColor', defaultValue: '#7c3aed', description: 'PWA theme color' },
  { envVar: 'DOCS_URL', helmKey: 'branding.docsUrl', defaultValue: 'kubestellar.io/docs/...', description: 'Documentation link in navbar' },
  { envVar: 'COMMUNITY_URL', helmKey: 'branding.communityUrl', defaultValue: 'kubestellar.io/community', description: 'Community/support link' },
  { envVar: 'WEBSITE_URL', helmKey: 'branding.websiteUrl', defaultValue: 'kubestellar.io', description: 'Project website URL' },
  { envVar: 'ISSUES_URL', helmKey: 'branding.issuesUrl', defaultValue: 'github.com/.../issues/new', description: 'Bug report / feedback URL' },
  { envVar: 'REPO_URL', helmKey: 'branding.repoUrl', defaultValue: 'github.com/.../console', description: 'Source code repository' },
  { envVar: 'HOSTED_DOMAIN', helmKey: 'branding.hostedDomain', defaultValue: 'console.kubestellar.io', description: 'Domain for demo mode' },
]

/* ------------------------------------------------------------------ */
/*  Install steps for each deployment mode                            */
/* ------------------------------------------------------------------ */

interface InstallStep {
  step: number
  title: string
  commands?: string[]
  note?: string
  description: string
}

const BINARY_STEPS: InstallStep[] = [
  {
    step: 1,
    title: 'Install and run with branding',
    commands: [
      'curl -sSL \\',
      '  https://raw.githubusercontent.com/kubestellar/console/main/start.sh \\',
      '  | CONSOLE_PROJECT=myproject \\',
      '    APP_NAME="My Project Console" \\',
      '    LOGO_URL="/custom-logos/my-logo.svg" \\',
      '    bash',
    ],
    description: 'Downloads pre-built binaries and starts the console with your branding. All env vars are optional — defaults to KubeStellar branding.',
  },
]

const HELM_STEPS: InstallStep[] = [
  {
    step: 1,
    title: 'Add the Helm repo',
    commands: [
      'helm repo add kubestellar-console https://kubestellar.github.io/console',
      'helm repo update',
    ],
    description: 'One-time setup. The chart is published to GitHub Pages.',
  },
  {
    step: 2,
    title: 'Install with your branding',
    commands: [
      'helm install my-console kubestellar-console/kubestellar-console \\',
      '  --set consoleProject=myproject \\',
      '  --set branding.appName="My Project Console" \\',
      '  --set branding.appShortName="MyProject" \\',
      '  --set branding.logoUrl="/custom-logos/my-logo.svg" \\',
      '  --set branding.docsUrl="https://docs.myproject.io" \\',
      '  --set branding.themeColor="#2563eb"',
    ],
    description: 'All branding values are optional. Omitted values use KubeStellar defaults. Set consoleProject to hide KubeStellar-specific features.',
  },
  {
    step: 3,
    title: 'Mount custom logos (optional)',
    commands: [
      '# Create a ConfigMap with your logo files',
      'kubectl create configmap my-logos --from-file=my-logo.svg=./logo.svg',
      '',
      '# Reference it in Helm values',
      'helm upgrade my-console kubestellar-console/kubestellar-console \\',
      '  --set branding.logoConfigMap=my-logos \\',
      '  --set branding.logoUrl="/custom-logos/my-logo.svg"',
    ],
    note: 'Logo files from the ConfigMap are mounted at /app/web/dist/custom-logos/ and served as static assets.',
    description: 'Use a ConfigMap to provide custom logo SVG/PNG files without rebuilding the image.',
  },
]

const DOCKER_STEPS: InstallStep[] = [
  {
    step: 1,
    title: 'Run with Docker',
    commands: [
      'docker run -p 8080:8080 \\',
      '  -e CONSOLE_PROJECT=myproject \\',
      '  -e APP_NAME="My Project Console" \\',
      '  -e APP_SHORT_NAME="MyProject" \\',
      '  -e LOGO_URL="/custom-logos/my-logo.svg" \\',
      '  -e DOCS_URL="https://docs.myproject.io" \\',
      '  ghcr.io/kubestellar/console:latest',
    ],
    description: 'All configuration is via env vars. Mount a volume at /app/web/dist/custom-logos for custom logo files.',
  },
]

/* ------------------------------------------------------------------ */
/*  Helper components                                                 */
/* ------------------------------------------------------------------ */

function VisibilityIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <span className="inline-flex items-center gap-1.5">
      <Eye className="w-4 h-4 text-green-400" />
      <span className="text-green-400 text-xs font-medium">Visible</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5">
      <EyeOff className="w-4 h-4 text-slate-500" />
      <span className="text-slate-500 text-xs font-medium">Hidden</span>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Deployment section with tabbed binary / helm / docker options      */
/* ------------------------------------------------------------------ */

function DeploymentSection() {
  const [activeTab, setActiveTab] = useState<DeployTab>('helm')
  const [copiedStep, setCopiedStep] = useState<string | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const switchTab = useCallback((tab: DeployTab) => {
    if (tab === activeTab) return
    setActiveTab(tab)
    emitWhiteLabelTabSwitch(tab)
  }, [activeTab])

  const copyCommands = useCallback(async (commands: string[], step: number) => {
    const text = commands.filter(c => !c.startsWith('#') && c !== '').join('\n')
    await copyToClipboard(text)
    const key = `${activeTab}-${step}`
    setCopiedStep(key)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedStep(null), COPY_FEEDBACK_MS)
    emitWhiteLabelCommandCopy(activeTab, step, commands[0])
    emitInstallCommandCopied('white_label', commands[0])
  }, [activeTab])

  const steps = activeTab === 'binary'
    ? BINARY_STEPS
    : activeTab === 'helm'
      ? HELM_STEPS
      : DOCKER_STEPS

  return (
    <section id="install" className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center mb-4">
        Deploy with{' '}
        <span className="text-purple-400">your branding</span>
      </h2>
      <p className="text-slate-400 text-center mb-12">
        All configuration is at runtime via env vars — no fork, no rebuild, no code changes.
      </p>

      {/* Deployment mode tabs */}
      <div className="max-w-3xl mx-auto mb-8">
        <div className="flex rounded-lg border border-slate-700/50 overflow-hidden">
          <button
            onClick={() => switchTab('binary')}
            className={`flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium transition-colors ${
              activeTab === 'binary'
                ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-400'
                : 'bg-slate-800/30 text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Binary
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">curl | bash</span>
          </button>
          <button
            onClick={() => switchTab('helm')}
            className={`flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium transition-colors ${
              activeTab === 'helm'
                ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-400'
                : 'bg-slate-800/30 text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <Package className="w-4 h-4" />
            Helm
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">recommended</span>
          </button>
          <button
            onClick={() => switchTab('docker')}
            className={`flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium transition-colors ${
              activeTab === 'docker'
                ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-400'
                : 'bg-slate-800/30 text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <Globe className="w-4 h-4" />
            Docker
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
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm">
                  {s.step}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2">{s.title}</h3>
                  {s.commands && s.commands.length > 0 && (
                    <div className="relative group">
                      <pre className="bg-slate-900 border border-slate-700/50 rounded-lg px-4 py-3 mb-3 text-sm text-green-400 overflow-x-auto pr-12">
                        <code>{s.commands.map((cmd, i) => (
                          <span key={i}>{i > 0 && '\n'}{cmd.startsWith('#') ? <span className="text-slate-500">{cmd}</span> : cmd === '' ? '' : <>$ {cmd}</>}</span>
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
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Branding reference table                                          */
/* ------------------------------------------------------------------ */

function BrandingReference() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center mb-4">
        Branding{' '}
        <span className="text-purple-400">reference</span>
      </h2>
      <p className="text-slate-400 text-center mb-12">
        Every field defaults to KubeStellar values. Override only what you need.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/60">
              <th className="px-5 py-3.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">Env Var</th>
              <th className="px-5 py-3.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">Helm Key</th>
              <th className="px-5 py-3.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">Default</th>
              <th className="px-5 py-3.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">Description</th>
            </tr>
          </thead>
          <tbody>
            {BRANDING_VARS.map((v, idx) => (
              <tr
                key={v.envVar}
                className={`border-b border-slate-700/30 ${idx % 2 === 0 ? 'bg-slate-800/20' : 'bg-transparent'}`}
              >
                <td className="px-5 py-3 text-sm">
                  <code className="text-purple-300 bg-slate-800 px-1.5 py-0.5 rounded text-xs">{v.envVar}</code>
                </td>
                <td className="px-5 py-3 text-sm">
                  <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-xs">{v.helmKey}</code>
                </td>
                <td className="px-5 py-3 text-xs text-slate-400 font-mono">{v.defaultValue}</td>
                <td className="px-5 py-3 text-sm text-slate-400">{v.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-6">
          <h4 className="font-semibold text-sm mb-3 text-purple-300 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Key env var: CONSOLE_PROJECT
          </h4>
          <p className="text-sm text-slate-400 leading-relaxed">
            Controls which project-specific cards and dashboards are visible.
            Set to your project name (e.g., <code className="text-purple-300/80 bg-slate-800 px-1 rounded">crossplane</code>,{' '}
            <code className="text-purple-300/80 bg-slate-800 px-1 rounded">istio</code>,{' '}
            <code className="text-purple-300/80 bg-slate-800 px-1 rounded">argo</code>).
            KubeStellar-specific features (benchmarks, deploy missions, cluster groups) are hidden automatically.
            Generic K8s dashboards always remain visible.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page component                                               */
/* ------------------------------------------------------------------ */

export function WhiteLabel() {
  useEffect(() => {
    emitWhiteLabelViewed()
  }, [])

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* ---- Hero Section ---- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-blue-900/20 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-sm">
            <Palette className="w-4 h-4" />
            White-Label Kubernetes Console
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
            Your brand.{' '}
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Our platform.
            </span>
          </h1>

          <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-6 leading-relaxed">
            Give your CNCF project a production-ready Kubernetes dashboard in minutes.{' '}
            <span className="text-white font-medium">150+ cards, 30 dashboards, AI missions</span> — all rebranded to your project.
          </p>

          <p className="text-base text-slate-400 max-w-2xl mx-auto mb-10">
            No fork needed. Set <code className="text-purple-300 bg-slate-800 px-2 py-0.5 rounded">CONSOLE_PROJECT=yourproject</code> and{' '}
            <code className="text-purple-300 bg-slate-800 px-2 py-0.5 rounded">APP_NAME=&quot;Your Console&quot;</code> — done.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/"
              onClick={() => emitWhiteLabelActioned('hero_try_demo')}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold text-lg transition-colors"
            >
              Try the Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#install"
              onClick={() => emitWhiteLabelActioned('hero_get_started')}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg border border-slate-600 hover:border-slate-500 hover:bg-slate-800/50 text-slate-300 font-medium text-lg transition-colors"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ---- What You Get ---- */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          What you{' '}
          <span className="text-purple-400">get</span>
        </h2>
        <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
          A complete Kubernetes dashboard — branded as your project, deployable via Helm, Docker, or a single curl command.
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

      {/* ---- Visibility Table ---- */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">What stays, what hides</h2>
        <p className="text-slate-400 text-center mb-12">
          When <code className="text-purple-300 bg-slate-800 px-2 py-0.5 rounded">CONSOLE_PROJECT</code> is set to your project, KubeStellar-specific cards are hidden automatically.
        </p>

        <div className="overflow-x-auto rounded-xl border border-slate-700/50 max-w-3xl mx-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/60">
                <th className="px-6 py-4 text-sm font-semibold text-slate-300">Feature</th>
                <th className="px-6 py-4 text-sm font-semibold text-purple-400 text-center">Your Project</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-400 text-center">KubeStellar Only</th>
              </tr>
            </thead>
            <tbody>
              {VISIBILITY_DATA.map((row, idx) => (
                <tr
                  key={row.feature}
                  className={`border-b border-slate-700/30 ${idx % 2 === 0 ? 'bg-slate-800/20' : 'bg-transparent'}`}
                >
                  <td className="px-6 py-3 text-sm font-medium text-slate-200">{row.feature}</td>
                  <td className="px-6 py-3 text-center">
                    <VisibilityIcon visible={row.universal} />
                  </td>
                  <td className="px-6 py-3 text-center">
                    <VisibilityIcon visible={row.kubeStellarOnly} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- Install Steps ---- */}
      <DeploymentSection />

      {/* ---- Branding Reference ---- */}
      <BrandingReference />

      {/* ---- Footer CTA ---- */}
      <section className="border-t border-slate-700/50 bg-gradient-to-b from-slate-900/50 to-[#0f172a]">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to white-label?</h2>
          <p className="text-slate-400 mb-10 text-lg max-w-2xl mx-auto">
            Your project deserves a dashboard. Start with a single Helm command — no fork, no rebuild, no maintenance burden.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/"
              onClick={() => emitWhiteLabelActioned('footer_try_demo')}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold text-lg transition-colors"
            >
              Try Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => emitWhiteLabelActioned('footer_view_github')}
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

export default WhiteLabel
