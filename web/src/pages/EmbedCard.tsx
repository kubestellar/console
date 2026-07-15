/**
 * EmbedCard — standalone page that renders a single CI/CD pipeline card
 * without navigation, sidebar, or chrome. Designed for iframe embedding.
 *
 * Route: /embed/:cardType?repo=owner/repo
 *
 * Supported cardType values:
 *   - nightly-release-pulse
 *   - workflow-matrix
 *   - pipeline-flow
 *   - recent-failures
 *
 * The `repo` query param is optional; when present it pre-sets the repo
 * filter on the card so the embed immediately shows data for that repo.
 */
import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PipelineFilterProvider } from '../components/cards/pipelines/PipelineFilterContext'
import { NightlyReleasePulse } from '../components/cards/pipelines/NightlyReleasePulse'
import { WorkflowMatrix } from '../components/cards/pipelines/WorkflowMatrix'
import { PipelineFlow } from '../components/cards/pipelines/PipelineFlow'
import { RecentFailures } from '../components/cards/pipelines/RecentFailures'

/** Map URL slug to React component */
const CARD_COMPONENTS: Record<string, React.ComponentType> = {
  'nightly-release-pulse': NightlyReleasePulse,
  'workflow-matrix': WorkflowMatrix,
  'pipeline-flow': PipelineFlow,
  'recent-failures': RecentFailures,
}

/** Human-readable labels for embed footer */
const CARD_LABELS: Record<string, string> = {
  'nightly-release-pulse': 'Nightly Release Pulse',
  'workflow-matrix': 'Workflow Matrix',
  'pipeline-flow': 'Live Runs',
  'recent-failures': 'Recent Failures',
}

/** Regex to validate owner/repo format */
const REPO_FORMAT_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/

/** Branding link text */
const BRANDING_LABEL = 'KubeStellar Console'
/** Branding link URL */
const BRANDING_URL = 'https://console.kubestellar.io'

export function EmbedCard() {
  const { cardType } = useParams<{ cardType: string }>()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const repo = searchParams.get('repo')

  const validRepo = useMemo(() => {
    if (!repo) return null
    return REPO_FORMAT_REGEX.test(repo) ? repo : null
  }, [repo])

  const CardComponent = cardType ? CARD_COMPONENTS[cardType] : null
  const cardLabel = cardType ? CARD_LABELS[cardType] ?? cardType : ''

  if (!CardComponent) {
    const supported = Object.keys(CARD_COMPONENTS).join(', ')
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground p-4">
        <div className="text-center max-w-md">
          <h1 className="text-lg font-semibold mb-2">
            {t('embed.unknownCard')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('embed.supportedCards')}: {supported}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
      <PipelineFilterProvider initialRepo={validRepo}>
        <div className="flex-1 min-h-0 overflow-auto">
          <CardComponent />
        </div>
      </PipelineFilterProvider>
      <div className="flex items-center justify-between px-3 py-1 border-t border-border/50 text-2xs text-muted-foreground">
        <span>{cardLabel}{validRepo ? ` — ${validRepo}` : ''}</span>
        <a
          href={BRANDING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          {BRANDING_LABEL}
        </a>
      </div>
    </div>
  )
}

export default EmbedCard
