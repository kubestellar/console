import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ExternalLink,
  Palette,
  Eye,
  EyeOff,
  Settings } from 'lucide-react'
import { emitWhiteLabelActioned } from '../lib/analytics'
import { ROUTES } from '../config/routes'
import { cn } from '@/lib/cn'
import {
  HIGHLIGHTS,
  VISIBILITY_DATA,
  BRANDING_VARS } from './WhiteLabel.data'

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
/*  Hero section                                                      */
/* ------------------------------------------------------------------ */

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-purple-900/20 via-transparent to-blue-900/20 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-sm">
          <Palette className="w-4 h-4" />
          White-Label Kubernetes Console
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
          Your brand.{' '}
          <span className="bg-linear-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Our platform.
          </span>
        </h1>

        <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-6 leading-relaxed">
          Give your CNCF project a production-ready Kubernetes dashboard in minutes.{' '}
          <span className="text-white font-medium">150+ cards, 30 dashboards, AI missions</span> — all rebranded to your project.
        </p>

        <div className="text-base text-muted-foreground max-w-2xl mx-auto mb-4">
          No fork needed. Set these variables and you&apos;re done.
        </div>

        <div className="max-w-2xl mx-auto mb-10">
          <pre className="overflow-x-auto rounded-xl border border-border/50 bg-card/80 px-4 py-3">
            <code
              className={cn(
                'block min-w-max whitespace-nowrap text-left font-mono text-sm text-purple-300',
                'sm:text-center'
              )}
            >
              CONSOLE_PROJECT=yourproject APP_NAME=&quot;Your Console&quot;
            </code>
          </pre>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to={ROUTES.HOME}
            onClick={() => emitWhiteLabelActioned('hero_try_demo')}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold text-lg transition-colors"
          >
            Try the Demo
            <ArrowRight className="w-5 h-5" />
          </Link>
          <a
            href="#install"
            onClick={() => emitWhiteLabelActioned('hero_get_started')}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg border border-border hover:border-border hover:bg-secondary/50 text-muted-foreground font-medium text-lg transition-colors"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  What You Get section                                              */
/* ------------------------------------------------------------------ */

export function HighlightsSection() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center mb-4">
        What you{' '}
        <span className="text-purple-400">get</span>
      </h2>
      <div className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
        A complete Kubernetes dashboard — branded as your project, deployable via Helm, Docker, or a single curl command.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {HIGHLIGHTS.map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-border/50 bg-secondary/30 p-6 hover:border-purple-500/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="mb-4">{item.icon}</div>
            <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Visibility table section                                          */
/* ------------------------------------------------------------------ */

export function VisibilityTableSection() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center mb-4">What stays, what hides</h2>
      <p className="text-muted-foreground text-center mb-12">
        When <code className="text-purple-300 bg-card px-2 py-0.5 rounded">CONSOLE_PROJECT</code> is set to your project, KubeStellar-specific cards are hidden automatically.
      </p>

      <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0 max-w-3xl mx-auto">
        <div className="rounded-xl border border-border/50">
          <table className="w-max min-w-full text-left">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/60">
              <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Feature</th>
              <th className="px-6 py-4 text-sm font-semibold text-purple-400 text-center">Your Project</th>
              <th className="px-6 py-4 text-sm font-semibold text-muted-foreground text-center">KubeStellar Only</th>
            </tr>
          </thead>
            <tbody>
              {VISIBILITY_DATA.map((row, idx) => (
                <tr
                  key={row.feature}
                  className={cn('border-b border-border/30', idx % 2 === 0 ? 'bg-secondary/20' : 'bg-transparent')}
                >
                  <td className="px-6 py-3 text-sm font-medium text-foreground">{row.feature}</td>
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
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Deployment section with tabbed binary / helm / docker options      */
/* ------------------------------------------------------------------ */

export { DeploymentSection } from './WhiteLabel.deployment'

/* ------------------------------------------------------------------ */
/*  Branding reference table                                          */
/* ------------------------------------------------------------------ */

export function BrandingReference() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center mb-4">
        Branding{' '}
        <span className="text-purple-400">reference</span>
      </h2>
      <div className="text-muted-foreground text-center mb-12">
        Every field defaults to KubeStellar values. Override only what you need.
      </div>

      <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
        <div className="rounded-xl border border-border/50">
          <table className="w-max min-w-full text-left">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/60">
              <th className="px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Env Var</th>
              <th className="px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Helm Key</th>
              <th className="px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default</th>
              <th className="px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</th>
            </tr>
          </thead>
            <tbody>
              {BRANDING_VARS.map((v, idx) => (
                <tr
                  key={v.envVar}
                  className={cn('border-b border-border/30', idx % 2 === 0 ? 'bg-secondary/20' : 'bg-transparent')}
                >
                  <td className="px-5 py-3 text-sm">
                    <code className="text-purple-300 bg-card px-1.5 py-0.5 rounded text-xs">{v.envVar}</code>
                  </td>
                  <td className="px-5 py-3 text-sm">
                    <code className="text-blue-300 bg-card px-1.5 py-0.5 rounded text-xs">{v.helmKey}</code>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground font-mono">{v.defaultValue}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{v.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-6">
          <h4 className="font-semibold text-sm mb-3 text-purple-300 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Key env var: CONSOLE_PROJECT
          </h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Controls which project-specific cards and dashboards are visible.
            Set to your project name (e.g., <code className="text-purple-300/80 bg-card px-1 rounded">crossplane</code>,{' '}
            <code className="text-purple-300/80 bg-card px-1 rounded">istio</code>,{' '}
            <code className="text-purple-300/80 bg-card px-1 rounded">argo</code>).
            KubeStellar-specific features (benchmarks, deploy missions, cluster groups) are hidden automatically.
            Generic K8s dashboards always remain visible.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Footer CTA section                                                */
/* ------------------------------------------------------------------ */

export function FooterCTASection() {
  return (
    <section className="border-t border-border/50 bg-linear-to-b from-slate-900/50 to-slate-950">
      <div className="max-w-5xl mx-auto px-6 py-20 text-center">
        <h2 className="text-4xl font-bold mb-4">Ready to white-label?</h2>
        <p className="text-muted-foreground mb-10 text-lg max-w-2xl mx-auto">
          Your project deserves a dashboard. Start with a single Helm command — no fork, no rebuild, no maintenance burden.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to={ROUTES.HOME}
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
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg border border-border hover:border-border hover:bg-secondary/50 text-muted-foreground font-medium text-lg transition-colors"
          >
            View on GitHub
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  )
}
