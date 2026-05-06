/**
 * NotFound — Friendly 404 page for unrecognised routes.
 *
 * Shown when a visitor hits a URL that doesn't match any known route
 * (e.g. /compliance-frameworks before the feature ships).
 *
 * Rather than a cold "404" error, it:
 *  - Explains the page doesn't exist (yet!)
 *  - Links popular destinations so users can self-navigate
 *  - Offers a one-click feature request (opens the in-app form or GitHub)
 *  - Highlights KubeStellar's fast iteration culture
 */
import { useLocation, useNavigate } from 'react-router-dom'
import { Compass, Home, Rocket, MessageSquarePlus, ArrowLeft, Sparkles, LayoutDashboard, Shield, Server, Zap } from 'lucide-react'
import { ROUTES } from '../config/routes'
import type { CSSProperties } from 'react'

// Inline style constants
const NOT_FOUND_COMPASS_STYLE_1: CSSProperties = { animationDuration: '8s' }


const QUICK_LINKS = [
  { label: 'Dashboard', path: ROUTES.HOME, icon: LayoutDashboard },
  { label: 'Clusters', path: ROUTES.CLUSTERS, icon: Server },
  { label: 'Compliance', path: ROUTES.COMPLIANCE, icon: Shield },
  { label: 'Deploy', path: ROUTES.DEPLOY, icon: Zap },
  { label: 'Marketplace', path: ROUTES.MARKETPLACE, icon: Rocket },
  { label: 'Cost', path: ROUTES.COST, icon: Sparkles },
]

export default function NotFound() {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname

  const featureRequestUrl =
    `https://github.com/kubestellar/console/issues/new?` +
    `template=feature_request.yaml&title=${encodeURIComponent(`Feature request: ${path}`)}&` +
    `labels=kind%2Ffeature&body=${encodeURIComponent(
      `## Feature Request\n\nI visited \`${path}\` and expected to find a page here.\n\n` +
      `### What I was looking for\n\n_Describe the feature or page you expected to see._\n\n` +
      `### Why it would be useful\n\n_How would this help your workflow?_`
    )}`

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Animated compass icon */}
        <div className="relative inline-flex items-center justify-center">
          <div className="absolute inset-0 w-24 h-24 mx-auto rounded-full bg-linear-to-br from-purple-500/20 to-blue-500/20 blur-xl motion-safe:animate-pulse" />
          <Compass className="w-20 h-20 text-purple-400 relative motion-safe:animate-spin" style={NOT_FOUND_COMPASS_STYLE_1} />
        </div>

        {/* Main message */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-zinc-100">
            Page not found
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            <code className="px-2 py-0.5 bg-zinc-800 rounded text-sm text-purple-300">{path}</code>
            {' '}doesn&apos;t exist yet — but it could!
          </p>
        </div>

        {/* Feature request CTA */}
        <div className="bg-linear-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-center gap-2 text-purple-300">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-semibold">Ship it in hours, not months</span>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            KubeStellar Console uses AI-powered repo automation to go from feature
            request to production in hours. Open an issue and watch the magic happen.
          </p>
          <a
            href={featureRequestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <MessageSquarePlus className="w-4 h-4" />
            Request this feature
          </a>
        </div>

        {/* Quick links */}
        <div className="space-y-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Popular pages</p>
          <div className="grid grid-cols-3 gap-2">
            {QUICK_LINKS.map(({ label, path: to, icon: Icon }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 hover:border-zinc-600 transition-colors group"
              >
                <Icon className="w-4 h-4 text-muted-foreground group-hover:text-purple-400 transition-colors" />
                <span className="text-xs text-muted-foreground group-hover:text-zinc-200 transition-colors">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Go back
          </button>
          <button
            onClick={() => navigate(ROUTES.HOME)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            Home
          </button>
        </div>
      </div>
    </div>
  )
}
