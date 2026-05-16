import { useEffect } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ROUTES } from '../../config/routes'
import { ComparisonTable } from './ComparisonTable'
import { HighlightGrid } from './HighlightGrid'
import { ACCENT_CLASSES } from './styles'
import { TabbedDeploySection } from './TabbedDeploySection'
import type { CompetitorLandingPageProps } from './types'

const LANDING_SURFACE_CLASS = 'bg-[#0f172a]'

export function CompetitorLandingPage({
  accentColor,
  competitorName,
  competitorSubtitle,
  analyticsSource,
  heroBadgeIcon,
  heroBadgeText,
  heroLeadText,
  heroLeadEmphasis,
  heroSupportText,
  appreciationIcon,
  appreciationTitle,
  appreciationDescription,
  appreciationLinkHref,
  appreciationLinkLabel,
  highlightTitle,
  highlightTitleAccent,
  highlightSubtitle,
  highlights,
  comparisonTitle,
  comparisonSubtitle,
  comparisonRows,
  deployTitle,
  deploySubtitle,
  localhostSteps,
  portForwardSteps,
  ingressSteps,
  footerDescription,
  onViewed,
  onActioned,
  onTabSwitch,
  onCommandCopy,
}: CompetitorLandingPageProps) {
  const accent = ACCENT_CLASSES[accentColor]

  useEffect(() => {
    onViewed()
  }, [onViewed])

  return (
    <div className={`min-h-screen ${LANDING_SURFACE_CLASS} text-white`}>
      <section className="relative overflow-hidden">
        <div className={`absolute inset-0 bg-linear-to-br ${accent.gradient} via-transparent to-blue-900/20 pointer-events-none`} />
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] ${accent.glow} rounded-full blur-3xl pointer-events-none`} />

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border ${accent.border} ${accent.bgLighter} ${accent.text300} text-sm`}>
            {heroBadgeIcon}
            {heroBadgeText}
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
            Coming from{' '}
            <span className={`bg-linear-to-r ${accent.gradientText} to-blue-400 bg-clip-text text-transparent`}>
              {competitorName}?
            </span>
          </h1>

          <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-6 leading-relaxed">
            {heroLeadText}{' '}
            <span className="text-white font-medium">{heroLeadEmphasis}</span>
          </p>

          <p className="text-sm text-slate-400 max-w-xl mx-auto mb-10">
            {heroSupportText}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to={ROUTES.HOME}
              onClick={() => onActioned('hero_try_demo')}
              className={`inline-flex items-center gap-2 px-8 py-3 rounded-lg ${accent.bg} ${accent.bgHover} text-white font-semibold text-lg transition-colors`}
            >
              Try Demo Mode
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onActioned('hero_view_github')}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg border border-slate-600 hover:border-slate-500 hover:bg-slate-800/50 text-slate-300 font-medium text-lg transition-colors"
            >
              View on GitHub
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className={`rounded-xl border ${accent.borderLight} ${accent.bgLightest} p-8 text-center`}>
          <div className="mx-auto mb-4 w-fit">{appreciationIcon}</div>
          <h3 className="text-lg font-semibold mb-3">{appreciationTitle}</h3>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm leading-relaxed">
            {appreciationDescription}
          </p>
          <a
            href={appreciationLinkHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 mt-4 text-sm ${accent.text} hover:opacity-80 transition-opacity`}
          >
            {appreciationLinkLabel}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>

      <HighlightGrid
        title={highlightTitle}
        titleAccent={highlightTitleAccent}
        subtitle={highlightSubtitle}
        highlights={highlights}
        accentColor={accentColor}
      />

      <ComparisonTable
        title={comparisonTitle}
        subtitle={comparisonSubtitle}
        rows={comparisonRows}
        competitorName={competitorName}
        competitorSubtitle={competitorSubtitle}
        accentColor={accentColor}
      />

      <TabbedDeploySection
        accentColor={accentColor}
        title={deployTitle}
        subtitle={deploySubtitle}
        localhostSteps={localhostSteps}
        portForwardSteps={portForwardSteps}
        ingressSteps={ingressSteps}
        analyticsSource={analyticsSource}
        onTabSwitch={onTabSwitch}
        onCommandCopy={onCommandCopy}
      />

      <section className="border-t border-slate-700/50 bg-linear-to-b from-slate-900/50 to-slate-950">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to explore?</h2>
          <p className="text-slate-400 mb-10 text-lg">{footerDescription}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to={ROUTES.HOME}
              onClick={() => onActioned('footer_try_demo')}
              className={`inline-flex items-center gap-2 px-8 py-3 rounded-lg ${accent.bg} ${accent.bgHover} text-white font-semibold text-lg transition-colors`}
            >
              Try Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onActioned('footer_view_github')}
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

export default CompetitorLandingPage
