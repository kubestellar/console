import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Sparkles,
  Shield,
  Cpu,
  DollarSign,
  GitBranch,
  Layers,
  Zap,
  ExternalLink,
  Play,
} from 'lucide-react'
import { emitWelcomeViewed, emitWelcomeActioned } from '../lib/analytics'
import { DEFAULT_PRIMARY_NAV, DISCOVERABLE_DASHBOARDS } from '../hooks/useSidebarConfig'
import { ROUTES } from '../config/routes'

/* ------------------------------------------------------------------ */
/*  SEO / meta constants                                               */
/* ------------------------------------------------------------------ */

const PAGE_TITLE = 'KubeStellar Console — Open Source Kubernetes Dashboard'
const META_DESCRIPTION =
  'AI-powered, multi-cluster Kubernetes dashboard with GPU visibility, cost analytics, security compliance, and GitOps — all open source, no sign-up required.'

/* ------------------------------------------------------------------ */
/*  Hero stats — social proof for conference audiences                 */
/*  Card and dashboard counts are derived from the actual registries   */
/*  so they stay in sync as the codebase evolves.                      */
/* ------------------------------------------------------------------ */

/** Total unique dashboards = default sidebar + discoverable dashboards.
 * Guard against undefined imports (e.g. a malformed chunk during HMR) per
 * CLAUDE.md array safety rule (#9889). */
const TOTAL_DASHBOARDS = new Set([
  ...(DEFAULT_PRIMARY_NAV || []).map(d => d.id),
  ...(DISCOVERABLE_DASHBOARDS || []).map(d => d.id),
]).size

const HERO_STATS_PLACEHOLDER = '…'

function buildHeroStats(cardCount: string) {
  return [
    { value: '250+', label: 'CNCF tools' },
    { value: String(TOTAL_DASHBOARDS), label: 'Dashboards' },
    { value: cardCount, label: 'Cards' },
    { value: '0', label: 'Paywalls' },
  ]
}

/* ------------------------------------------------------------------ */
/*  "See it in action" scenarios — the 30-second aha moments           */
/* ------------------------------------------------------------------ */

interface Scenario {
  icon: React.ReactNode
  title: string
  description: string
  /** Dashboard path to deep-link into */
  link: string
}

const SCENARIOS: Scenario[] = [
  {
    icon: <Sparkles className="w-6 h-6 text-purple-400" />,
    title: 'AI diagnoses a crashing pod',
    description: 'Watch the AI mission scan your cluster, find the root cause, and propose a fix — all in natural language.',
    link: ROUTES.HOME,
  },
  {
    icon: <Layers className="w-6 h-6 text-purple-400" />,
    title: 'Multi-cluster at a glance',
    description: 'See cluster health, node status, and pod issues across every cluster in a single view.',
    link: ROUTES.CLUSTERS,
  },
  {
    icon: <Cpu className="w-6 h-6 text-purple-400" />,
    title: 'GPU workload monitoring',
    description: 'Track GPU reservations, utilization, and AI/ML workload performance with built-in dashboards.',
    link: ROUTES.AI_ML,
  },
  {
    icon: <Shield className="w-6 h-6 text-purple-400" />,
    title: 'Security & compliance scoring',
    description: 'OPA, Kyverno, Kubescape, and Trivy — all built in. See your compliance posture in seconds.',
    link: ROUTES.COMPLIANCE,
  },
  {
    icon: <DollarSign className="w-6 h-6 text-purple-400" />,
    title: 'Cost visibility per namespace',
    description: 'OpenCost integration shows exactly where your spend is going. No separate billing tool.',
    link: ROUTES.COST,
  },
  {
    icon: <GitBranch className="w-6 h-6 text-purple-400" />,
    title: 'GitOps sync status',
    description: 'ArgoCD and Flux drift detection baked in. See what\'s out of sync at a glance.',
    link: ROUTES.GITOPS,
  },
]

/* ------------------------------------------------------------------ */
/*  What makes this different — quick differentiators                  */
/* ------------------------------------------------------------------ */

const DIFFERENTIATORS = [
  'No account required',
  'No license keys',
  'Apache 2.0',
  'Works offline',
  'AI-powered missions',
  'Multi-cluster native',
]

/* ------------------------------------------------------------------ */
/*  Ref parameter sanitization (#7551)                                 */
/* ------------------------------------------------------------------ */

/** Maximum length for the ref analytics dimension to prevent high-cardinality pollution */
const REF_MAX_LENGTH = 64

/** Allowed ref values — anything outside this set is normalized to "other" */
const ALLOWED_REFS = new Set([
  'direct',
  'github',
  'cncf',
  'kubecon',
  'twitter',
  'linkedin',
  'medium',
  'docs',
  'hackernews',
  'reddit',
  'youtube',
])

/** Normalize the raw ?ref= query parameter to a safe analytics value */
function sanitizeRef(raw: string | null): string {
  if (!raw) return 'direct'
  const normalized = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, REF_MAX_LENGTH)
  if (!normalized) return 'direct'
  // Allow known refs and any intern-NN utm_term pattern
  if (ALLOWED_REFS.has(normalized) || /^intern-\d{1,3}$/.test(normalized)) return normalized
  return 'other'
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export function Welcome() {
  const [searchParams] = useSearchParams()
  const ref = sanitizeRef(searchParams.get('ref'))
  const [cardCount, setCardCount] = useState(HERO_STATS_PLACEHOLDER)
  useEffect(() => {
    let cancelled = false
    import('../components/cards/cardRegistry')
      .then(m => {
        if (cancelled) return
        setCardCount(String(m.getRegisteredCardTypes().length))
      })
      .catch((err: unknown) => {
        console.warn('Welcome: failed to load cardRegistry chunk', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const prevTitle = document.title
    const metaDesc = document.querySelector('meta[name="description"]')
    const prevDescription = metaDesc?.getAttribute('content') ?? ''
    const createdTag = !metaDesc

    document.title = PAGE_TITLE
    if (metaDesc) {
      metaDesc.setAttribute('content', META_DESCRIPTION)
    } else {
      const meta = document.createElement('meta')
      meta.name = 'description'
      meta.content = META_DESCRIPTION
      document.head.appendChild(meta)
    }
    emitWelcomeViewed(ref)

    // Restore previous title and meta description on unmount so they don't
    // leak into other routes during SPA navigation (#7423).
    // #7553: If we created the tag (none existed before), remove it entirely
    // instead of leaving an empty description tag behind.
    return () => {
      document.title = prevTitle
      const desc = document.querySelector('meta[name="description"]')
      if (desc) {
        if (createdTag) {
          desc.remove()
        } else {
          desc.setAttribute('content', prevDescription)
        }
      }
    }
  }, [ref])

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-purple-900/20 via-transparent to-blue-900/20 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-sm">
            <Zap className="w-4 h-4" />
            Open Source &middot; AI-Powered &middot; Multi-Cluster
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Your Kubernetes clusters.{' '}
            <span className="bg-linear-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              One&nbsp;console.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-4 leading-relaxed">
            KubeStellar Console is the open-source Kubernetes dashboard with{' '}
            <span className="text-white font-medium">AI troubleshooting, GPU visibility, cost analytics, and security compliance</span>{' '}
            built in — not bolted on.
          </p>

          <p className="text-sm text-slate-400 max-w-xl mx-auto mb-10">
            No sign-up. No install. Explore the full demo right now.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              to={ROUTES.HOME}
              onClick={() => emitWelcomeActioned('hero_explore_demo', ref)}
              className="inline-flex items-center gap-2 px-8 py-4 sm:py-3.5 rounded-lg bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white font-semibold text-lg transition-colors w-full sm:w-auto justify-center"
            >
              <Play className="w-5 h-5" />
              Explore the Demo
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => emitWelcomeActioned('hero_github', ref)}
              className="inline-flex items-center gap-2 px-8 py-4 sm:py-3.5 rounded-lg border border-slate-600 hover:border-slate-500 hover:bg-slate-800/50 active:bg-slate-800 text-slate-300 font-medium text-lg transition-colors w-full sm:w-auto justify-center"
            >
              GitHub
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl mx-auto">
            {buildHeroStats(cardCount).map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-purple-400">{stat.value}</div>
                <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Differentiator pills ---- */}
      <section className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {DIFFERENTIATORS.map((d) => (
            <span
              key={d}
              className="px-4 py-1.5 rounded-full border border-slate-700/50 bg-slate-800/30 text-sm text-slate-300"
            >
              {d}
            </span>
          ))}
        </div>
      </section>

      {/* ---- Scenarios — "See it in action" ---- */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          See it in{' '}
          <span className="text-purple-400">action</span>
        </h2>
        <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
          Click any scenario to jump straight into the demo dashboard.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SCENARIOS.map((scenario) => (
            <Link
              key={scenario.title}
              to={scenario.link}
              onClick={() => emitWelcomeActioned(`scenario_${scenario.link}`, ref)}
              className="group rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 hover:border-purple-500/30 hover:bg-slate-800/50 active:bg-slate-800/70 transition-colors touch-manipulation"
            >
              <div className="mb-4">{scenario.icon}</div>
              <h3 className="text-lg font-semibold mb-2 group-hover:text-purple-300 transition-colors">
                {scenario.title}
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-3">{scenario.description}</p>
              <span className="inline-flex items-center gap-1.5 text-sm text-purple-400 group-hover:text-purple-300 transition-colors">
                Try it
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- Footer CTA ---- */}
      <section className="border-t border-slate-700/50 bg-linear-to-b from-slate-900/50 to-[#0f172a]">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to try it?</h2>
          <p className="text-slate-400 mb-10 text-lg">
            The full demo runs in your browser. No cluster required.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to={ROUTES.HOME}
              onClick={() => emitWelcomeActioned('footer_explore_demo', ref)}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold text-lg transition-colors"
            >
              Explore the Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => emitWelcomeActioned('footer_github', ref)}
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

export default Welcome
