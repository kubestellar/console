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

export function Drasi() {
  const { t } = useTranslation()
  const { data, isLoading, error, isDemoData } = useDrasiResources()

  const hasRealData = !isDemoData && !!data && ((data.sources || []).length > 0 || (data.queries || []).length > 0)

  const getStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'sources':
        return {
          value: (data?.sources || []).length,
          sublabel: t('drasi.statSources'),
          isClickable: false,
          isDemo: isDemoData,
        }
      case 'queries':
        return {
          value: (data?.queries || []).length,
          sublabel: t('drasi.statContinuousQueries'),
          isClickable: false,
          isDemo: isDemoData,
        }
      case 'reactions':
        return {
          value: (data?.reactions || []).length,
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
