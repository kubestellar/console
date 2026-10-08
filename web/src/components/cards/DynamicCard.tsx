import { AlertTriangle } from 'lucide-react'
import { getDynamicCard } from '../../lib/dynamic-cards/dynamicCardRegistry'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useCardDemoState, useReportCardDataState } from './CardDataContext'
import type { CardComponentProps } from './cardRegistry'
import { useTranslation } from 'react-i18next'
import { Tier1CardRuntime } from './DynamicCardTier1Runtime'
import { Tier2CardRuntime } from './DynamicCardTier2Runtime'

export { Tier1CardRuntime, type Tier1Props } from './DynamicCardTier1Runtime'
export { Tier2CardRuntime, type Tier2Props } from './DynamicCardTier2Runtime'

/**
 * DynamicCard: Meta-component that renders dynamic card definitions.
 *
 * - For Tier 1 (declarative): Renders using built-in card runtime
 * - For Tier 2 (custom code): Compiles TSX and renders the result
 *
 * Registered as `dynamic_card` in CARD_COMPONENTS.
 * config.dynamicCardId determines which definition to render.
 */
export function DynamicCard({ config }: CardComponentProps) {
  const { t } = useTranslation('cards')
  // Guard against undefined/null config to prevent crashes (#4910)
  const safeConfig = config ?? {}
  const dynamicCardId = (typeof safeConfig.dynamicCardId === 'string' ? safeConfig.dynamicCardId : '') || ''
  const definition = getDynamicCard(dynamicCardId)

  // Report demo state: dynamic cards depend on the agent for live API data.
  //
  // #9058 — Always include `hasData: true` in this report. Previously this
  // call reported `{ isDemoData, isFailed, consecutiveFailures }` without
  // `hasData`, leaving `hasData` as `undefined` (falsy). Because
  // `useReportCardDataState` uses `useLayoutEffect` and parent layout
  // effects fire AFTER children's, the meta-component's report runs LAST
  // and overwrote the `hasData: true` that `Tier1CardRuntime` /
  // `Tier2CardRuntime` had reported. CardWrapper then saw
  // `!childDataState.hasData` for a rendered card and painted its generic
  // "No data available" empty-state overlay (with a Retry button) on top
  // of a perfectly valid custom card with valid inline/static data.
  //
  // Reporting `hasData: true` here is correct for BOTH branches:
  //  - Error shell states below (missing id / missing definition /
  //    invalid tier definition): the shell IS the rendered content, so
  //    we tell CardWrapper not to paint its generic empty state over it.
  //  - Tier runtime branch: the card's content (data rows, internal
  //    empty-state message, or internal skeleton) IS the rendered
  //    content, and the runtime handles its own internal loading/empty/
  //    error UI.
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })
  useReportCardDataState({
    isDemoData: shouldUseDemoData,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    hasData: true,
  })

  if (!dynamicCardId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-8 h-8 text-yellow-400 mb-2" />
        <p className="text-sm text-muted-foreground">
          {t('dynamicCard.missingConfig')}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {t('dynamicCard.noDynamicCardId')}
        </p>
      </div>
    )
  }

  if (!definition) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-8 h-8 text-yellow-400 mb-2" />
        <p className="text-sm text-muted-foreground">
          {t('dynamicCard.notFound', { id: dynamicCardId })}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {t('dynamicCard.notFoundHint')}
        </p>
      </div>
    )
  }

  return (
    <DynamicCardErrorBoundary cardId={dynamicCardId}>
      {definition.tier === 'tier1' && definition.cardDefinition ? (
        <Tier1CardRuntime definition={definition} cardDefinition={definition.cardDefinition} />
      ) : definition.tier === 'tier2' && definition.sourceCode ? (
        <Tier2CardRuntime definition={definition} config={safeConfig} />
      ) : (
        <div className="h-full flex flex-col items-center justify-center p-4 text-center">
          <AlertTriangle className="w-8 h-8 text-yellow-400 mb-2" />
          <p className="text-sm text-muted-foreground">
            {t('dynamicCard.invalidDefinition', { missing: definition.tier === 'tier1' ? t('dynamicCard.cardDefinition') : t('dynamicCard.sourceCode') })}
          </p>
        </div>
      )}
    </DynamicCardErrorBoundary>
  )
}
