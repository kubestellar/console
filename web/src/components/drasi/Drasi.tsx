/**
 * Drasi Dashboard Page
 *
 * Reactive data pipelines — visualize sources, continuous queries, and reactions.
 */
import { useTranslation } from 'react-i18next'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { StatBlockValue } from '../ui/StatsOverview'
import { useDrasiResources } from '../../hooks/useDrasiResources'

const DRASI_CARDS_KEY = 'kubestellar-drasi-cards'

const DEFAULT_DRASI_CARDS = getDefaultCards('drasi')

// Demo stat counts — match the default demo pipeline in DrasiReactiveGraph
const DEMO_SOURCE_COUNT = 3
const DEMO_QUERY_COUNT = 4
const DEMO_REACTION_COUNT = 1

export function Drasi() {
  const { t } = useTranslation()
  const { data, isLoading, error } = useDrasiResources()

  const hasRealData = !!data && ((data.sources || []).length > 0 || (data.queries || []).length > 0)
  const isDemoData = !hasRealData && !isLoading

  const getStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'sources':
        return {
          value: (data?.sources || []).length ?? (isDemoData ? DEMO_SOURCE_COUNT : 0),
          sublabel: t('drasi.statSources'),
          isClickable: false,
          isDemo: isDemoData,
        }
      case 'queries':
        return {
          value: (data?.queries || []).length ?? (isDemoData ? DEMO_QUERY_COUNT : 0),
          sublabel: t('drasi.statContinuousQueries'),
          isClickable: false,
          isDemo: isDemoData,
        }
      case 'reactions':
        return {
          value: (data?.reactions || []).length ?? (isDemoData ? DEMO_REACTION_COUNT : 0),
          sublabel: t('drasi.statReactions'),
          isClickable: false,
          isDemo: isDemoData,
        }
      default:
        return { value: '-' }
    }
  }

  return (
    <DashboardPage
      title="Drasi"
      subtitle="Reactive data pipelines and continuous queries"
      icon="GitBranch"
      rightExtra={<RotatingTip page="drasi" />}
      storageKey={DRASI_CARDS_KEY}
      defaultCards={DEFAULT_DRASI_CARDS}
      statsType="drasi"
      getStatValue={getStatValue}
      isLoading={isLoading}
      hasData={hasRealData || isDemoData}
      isDemoData={isDemoData}
      emptyState={{
        title: 'No Drasi Pipelines',
        description: 'Connect to a Drasi instance to visualize reactive data pipelines. Set VITE_DRASI_API_URL to your Drasi management API endpoint.',
      }}
    >
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          <div className="font-medium">{t('drasi.errorLoadingResources')}</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      )}
    </DashboardPage>
  )
}
